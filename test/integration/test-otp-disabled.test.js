import { sendEmail } from '~/src/lib/notify.js'
import { TEST_OTPS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const TEST_ADDRESS = 'perf-1@example.forms.defra.gov.uk'

const { inject, injectWithoutToken, requestCodeResponse } = setupSigninFlow()

describe('sign-in for automated tests, with no test secret', () => {
  it('emails the code to a test address and keeps no copy', async () => {
    await requestCodeResponse('uid-off', TEST_ADDRESS)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(
      await db.collection(TEST_OTPS_COLLECTION_NAME).find().toArray()
    ).toEqual([])
  })

  it('has no test route', async () => {
    const withSecret = await injectWithoutToken({
      method: 'GET',
      url: '/test/otp/uid-off',
      headers: { authorization: `Bearer ${'a'.repeat(32)}` }
    })
    const withServiceToken = await inject({
      method: 'GET',
      url: '/test/otp/uid-off'
    })

    expect(withSecret.statusCode).toBe(404)
    expect(withServiceToken.statusCode).toBe(404)
  })
})
