import { sendEmail } from '~/src/lib/notify.js'
import {
  OTPS_COLLECTION_NAME,
  OTP_LOCKOUTS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const { inject, requestCode, requestCodeResponse, verify } = setupSigninFlow()

/** Codes an address may request in a window before it is locked out */
const MAX_REQUESTS = 5

const EMAIL = 'citizen@example.com'

/**
 * Requests codes up to the limit, each on its own interaction, so the next
 * request is the one that locks the address out
 * @param {string} prefix
 * @param {string} [email]
 */
async function exhaustLimit(prefix, email = EMAIL) {
  for (let i = 0; i < MAX_REQUESTS; i++) {
    await requestCode(`${prefix}-${i}`, email)
  }
}

/**
 * Moves an address's counter back in time, which is how these tests age a
 * window or a lockout out without waiting two hours
 * @param {string} target
 * @param {number} ms
 */
async function ageCounter(target, ms) {
  const counter = await db
    .collection(OTP_LOCKOUTS_COLLECTION_NAME)
    .findOne({ target })
  const shift = (/** @type {Date | null} */ date) =>
    date ? new Date(date.getTime() - ms) : date

  await db.collection(OTP_LOCKOUTS_COLLECTION_NAME).updateOne(
    { target },
    {
      $set: {
        windowStartedAt: shift(counter?.windowStartedAt),
        lockedUntil: shift(counter?.lockedUntil)
      }
    }
  )
}

describe('otp request lockout', () => {
  it('refuses the request past the limit and sends no code', async () => {
    await exhaustLimit('uid-limit')
    jest.mocked(sendEmail).mockClear()

    const res = await requestCodeResponse('uid-limit-over')

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({
      status: 'locked-out',
      lockedUntil: expect.any(String)
    })
    expect(sendEmail).not.toHaveBeenCalled()
    await expect(
      db
        .collection(OTPS_COLLECTION_NAME)
        .countDocuments({ uid: 'uid-limit-over' })
    ).resolves.toBe(0)
  }, 15_000)

  it('locks the address, not the interaction: a fresh uid is refused too', async () => {
    await exhaustLimit('uid-address')
    await requestCodeResponse('uid-address-over')

    const res = await requestCodeResponse('uid-address-brand-new')

    expect(JSON.parse(res.payload).status).toBe('locked-out')
  }, 15_000)

  it('leaves a code already issued usable while the lockout holds', async () => {
    // the lockout stops new codes going out; it does not invalidate the code
    // the citizen is already holding
    const code = await requestCode('uid-holding')
    for (let i = 1; i < MAX_REQUESTS; i++) {
      await requestCode(`uid-holding-${i}`)
    }
    await requestCodeResponse('uid-holding-over')

    expect(await verify('uid-holding', code)).toEqual({
      status: 'phone-required'
    })
  }, 15_000)

  it('counts each address separately', async () => {
    await exhaustLimit('uid-mine')
    await requestCodeResponse('uid-mine-over')

    const res = await requestCodeResponse('uid-theirs', 'someone@example.com')

    expect(JSON.parse(res.payload).status).toBe('otp-issued')
  }, 15_000)

  it('puts the count back to zero once the citizen signs in', async () => {
    // the codes were reaching the person who owns the address, so the count
    // they ran up getting in does not follow them into the next sign-in
    const code = await requestCode('uid-in-0')
    for (let i = 1; i < MAX_REQUESTS; i++) {
      await requestCode(`uid-in-${i}`)
    }

    expect(await verify('uid-in-0', code)).toEqual({ status: 'phone-required' })
    const signup = await inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-in-0', phone: '07911 123456' }
    })
    expect(JSON.parse(signup.payload).status).toBe('signed-in')

    await expect(
      db.collection(OTP_LOCKOUTS_COLLECTION_NAME).countDocuments({})
    ).resolves.toBe(0)
    // the request that would have locked the address now gets a code
    const res = await requestCodeResponse('uid-in-next')
    expect(JSON.parse(res.payload).status).toBe('otp-issued')
  }, 15_000)

  it('starts the count again once the lockout has passed', async () => {
    await exhaustLimit('uid-lifted')
    await requestCodeResponse('uid-lifted-over')

    await ageCounter(EMAIL, 2 * 60 * 60 * 1000)

    const res = await requestCodeResponse('uid-lifted-after')

    expect(JSON.parse(res.payload).status).toBe('otp-issued')
    const counter = await db
      .collection(OTP_LOCKOUTS_COLLECTION_NAME)
      .findOne({ target: EMAIL })
    expect(counter?.requests).toBe(1)
    expect(counter?.lockedUntil).toBeNull()
  }, 15_000)

  it('starts the count again once the window has passed without a lockout', async () => {
    await exhaustLimit('uid-window')

    await ageCounter(EMAIL, 2 * 60 * 60 * 1000)

    const res = await requestCodeResponse('uid-window-after')

    expect(JSON.parse(res.payload).status).toBe('otp-issued')
    await expect(
      db
        .collection(OTP_LOCKOUTS_COLLECTION_NAME)
        .findOne({ target: EMAIL })
        .then((counter) => counter?.requests)
    ).resolves.toBe(1)
  }, 15_000)
})
