import { sendEmail } from '~/src/lib/notify.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const TEST_ADDRESS = 'perf-1@example.forms.defra.gov.uk'

const { injectWithoutToken, requestCodeResponse } = setupSigninFlow()

describe('sign-in for automated tests, with no test secret', () => {
  it.each([
    ['an empty value', ''],
    ['a value of 32 characters', 'a'.repeat(32)]
  ])('refuses a caller that sends %s', async (_name, secret) => {
    await requestCodeResponse('uid-no-secret', TEST_ADDRESS)

    const res = await injectWithoutToken({
      method: 'GET',
      url: '/test/otp/uid-no-secret',
      headers: { authorization: `Bearer ${secret}` }
    })

    expect(sendEmail).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })
})
