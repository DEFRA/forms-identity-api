import { config } from '~/src/config/index.js'
import { sendEmail } from '~/src/lib/notify.js'
import { TEST_OTPS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const SECRET = 'a-test-secret-of-32-characters-x'
const TEST_ADDRESS = 'perf-1@example.forms.defra.gov.uk'

// Set before the suite hooks build the server, which reads both values
config.set('otp.testRead.enabled', true)
config.set('otp.testRead.secret', SECRET)

const { inject, injectWithoutToken, requestCodeResponse, verify } =
  setupSigninFlow()

/**
 * Reads the kept code as a test does, with the secret as the bearer token
 * @param {string} uid
 * @param {string} [secret]
 */
const readCode = (uid, secret = SECRET) =>
  injectWithoutToken({
    method: 'GET',
    url: `/test/otp/${uid}`,
    headers: { authorization: `Bearer ${secret}` }
  })

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

    const read = await readCode('uid-test')

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

    const { code } = JSON.parse((await readCode('uid-resend')).payload)

    expect(await verify('uid-resend', code)).toEqual({
      status: 'phone-required'
    })
  })

  it.each([
    'citizen@example.com',
    'citizen@evil-example.forms.defra.gov.uk',
    'citizen@example.forms.defra.gov.uk.evil.com'
  ])('emails the code to %s and keeps no copy', async (email) => {
    await requestCodeResponse('uid-real', email)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(await keptCodes()).toEqual([])
    expect((await readCode('uid-real')).statusCode).toBe(404)
  })

  it('answers 404 for an interaction with no code', async () => {
    expect((await readCode('uid-unknown')).statusCode).toBe(404)
  })

  it('answers 404 for a code that is out of date', async () => {
    await requestCodeResponse('uid-expired', TEST_ADDRESS)
    await db
      .collection(TEST_OTPS_COLLECTION_NAME)
      .updateOne(
        { uid: 'uid-expired' },
        { $set: { expireAt: new Date(Date.now() - 1000) } }
      )

    expect((await readCode('uid-expired')).statusCode).toBe(404)
  })

  it('refuses a caller with a different secret', async () => {
    await requestCodeResponse('uid-wrong', TEST_ADDRESS)

    const res = await readCode('uid-wrong', 'b'.repeat(32))

    expect(res.statusCode).toBe(401)
  })

  it('refuses a caller with no secret', async () => {
    const res = await injectWithoutToken({
      method: 'GET',
      url: '/test/otp/uid-test'
    })

    expect(res.statusCode).toBe(401)
  })

  it('refuses the forms-identity-ui token on the test route', async () => {
    const res = await inject({ method: 'GET', url: '/test/otp/uid-test' })

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
