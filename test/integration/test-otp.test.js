import { config } from '~/src/config/index.js'
import { PURPOSE, TRANSPORT } from '~/src/constants.js'
import { sendEmail } from '~/src/lib/notify.js'
import { TEST_OTPS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { createAccount } from '~/src/services/signin-service.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const SECRET = config.get('otp.testRead.secret')
const TEST_ADDRESS = 'perf-1@example.forms.defra.gov.uk'

const { inject, injectWithoutToken, requestCodeResponse, verify } =
  setupSigninFlow()

/**
 * Reads the kept sign-in code as a test does, with the secret as the bearer
 * token
 * @param {string} email
 * @param {string} [secret]
 */
const readCode = (email, secret = SECRET) =>
  injectWithoutToken({
    method: 'GET',
    url: `/test/otp/${email}/${PURPOSE.SIGNIN_VERIFY_EMAIL}`,
    headers: { authorization: `Bearer ${secret}` }
  })

/**
 * @param {string} email
 * @param {string} purpose
 */
const readCodeFor = (email, purpose) =>
  injectWithoutToken({
    method: 'GET',
    url: `/test/otp/${email}/${purpose}`,
    headers: { authorization: `Bearer ${SECRET}` }
  })

/**
 * Requests a code for a change of email address on a new account
 * @param {string} uid
 * @param {string} newEmail
 */
async function requestChangeOfEmail(uid, newEmail) {
  const account = await createAccount('citizen@example.com', '+447911123456')

  return inject({
    method: 'POST',
    url: '/otp/request',
    payload: {
      uid,
      purpose: PURPOSE.ACCOUNT_VERIFY_EMAIL,
      transport: TRANSPORT.EMAIL,
      accountId: account._id,
      target: newEmail
    }
  })
}

const keptCodes = () =>
  db.collection(TEST_OTPS_COLLECTION_NAME).find().toArray()

describe('sign-in for automated tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lets a test read the code for a test address and sign in with it', async () => {
    const requested = await requestCodeResponse('uid-test', TEST_ADDRESS)

    expect(JSON.parse(requested.payload)).toEqual({ status: 'otp-issued' })
    expect(sendEmail).not.toHaveBeenCalled()

    const read = await readCode(TEST_ADDRESS)

    expect(read.statusCode).toBe(200)

    const { code } = JSON.parse(read.payload)

    expect(code).toMatch(/^\d{6}$/)
    expect(await verify('uid-test', code)).toEqual({
      status: 'phone-required'
    })
  })

  it('gives the newest code after a resend', async () => {
    await requestCodeResponse('uid-resend', TEST_ADDRESS)
    await requestCodeResponse('uid-resend', TEST_ADDRESS)

    expect(await keptCodes()).toHaveLength(1)

    const { code } = JSON.parse((await readCode(TEST_ADDRESS)).payload)

    expect(await verify('uid-resend', code)).toEqual({
      status: 'phone-required'
    })
  })

  it('keeps a code for a change of email address to a test address', async () => {
    const requested = await requestChangeOfEmail('uid-change', TEST_ADDRESS)

    expect(JSON.parse(requested.payload)).toEqual({ status: 'otp-issued' })
    expect(sendEmail).not.toHaveBeenCalled()

    const read = await readCodeFor(TEST_ADDRESS, PURPOSE.ACCOUNT_VERIFY_EMAIL)

    expect(read.statusCode).toBe(200)
    expect(JSON.parse(read.payload).code).toMatch(/^\d{6}$/)
  })

  it('gives the sign-in code to a read for the sign-in purpose', async () => {
    await requestChangeOfEmail('uid-change', TEST_ADDRESS)
    await requestCodeResponse('uid-both', TEST_ADDRESS)

    expect(await keptCodes()).toHaveLength(2)

    const { code } = JSON.parse((await readCode(TEST_ADDRESS)).payload)

    expect(await verify('uid-both', code)).toEqual({
      status: 'phone-required'
    })
  })

  it('answers 404 for a purpose with no code', async () => {
    await requestCodeResponse('uid-signin-only', TEST_ADDRESS)

    const read = await readCodeFor(TEST_ADDRESS, PURPOSE.ACCOUNT_VERIFY_EMAIL)

    expect(read.statusCode).toBe(404)
  })

  it.each([
    'citizen@example.com',
    'citizen@evil-example.forms.defra.gov.uk',
    'citizen@example.forms.defra.gov.uk.evil.com'
  ])('emails the code to %s and keeps no copy', async (email) => {
    await requestCodeResponse('uid-real', email)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(await keptCodes()).toEqual([])
    expect((await readCode(email)).statusCode).toBe(404)
  })

  it('answers 404 for an address with no code', async () => {
    expect((await readCode(TEST_ADDRESS)).statusCode).toBe(404)
  })

  it('reads the code for an address in another letter case', async () => {
    await requestCodeResponse('uid-case', TEST_ADDRESS)

    const read = await readCode('Perf-1@Example.Forms.Defra.Gov.UK')

    expect(read.statusCode).toBe(200)
  })

  it('answers 404 for a code that is out of date', async () => {
    await requestCodeResponse('uid-expired', TEST_ADDRESS)
    await db
      .collection(TEST_OTPS_COLLECTION_NAME)
      .updateOne(
        { target: TEST_ADDRESS },
        { $set: { expireAt: new Date(Date.now() - 1000) } }
      )

    expect((await readCode(TEST_ADDRESS)).statusCode).toBe(404)
  })

  it('refuses a caller with a different secret', async () => {
    await requestCodeResponse('uid-wrong', TEST_ADDRESS)

    const res = await readCode(TEST_ADDRESS, 'b'.repeat(32))

    expect(res.statusCode).toBe(401)
  })

  it('refuses a caller with no secret', async () => {
    const res = await injectWithoutToken({
      method: 'GET',
      url: `/test/otp/${TEST_ADDRESS}/${PURPOSE.SIGNIN_VERIFY_EMAIL}`
    })

    expect(res.statusCode).toBe(401)
  })

  it('refuses the forms-identity-ui token on the test route', async () => {
    const res = await inject({
      method: 'GET',
      url: `/test/otp/${TEST_ADDRESS}/${PURPOSE.SIGNIN_VERIFY_EMAIL}`
    })

    expect(res.statusCode).toBe(401)
  })

  it('refuses the test secret on the other routes', async () => {
    const res = await injectWithoutToken({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-other', target: TEST_ADDRESS },
      headers: { authorization: `Bearer ${SECRET}` }
    })

    expect(res.statusCode).toBe(401)
  })
})
