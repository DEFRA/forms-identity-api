import { token } from '@hapi/jwt'

import { postJson } from '~/src/lib/fetch.js'
import { sendOtp } from '~/src/repositories/notifier.js'

jest.mock('~/src/lib/fetch.js')

describe('notifier', () => {
  it('posts the code to Notify with a bearer JWT and expiry personalisation', async () => {
    await sendOtp('citizen@example.com', '123456')

    expect(postJson).toHaveBeenCalledTimes(1)
    const [url, options] =
      /** @type {[URL, { payload: object, headers: Record<string, string> }]} */ (
        jest.mocked(postJson).mock.calls[0]
      )
    expect(url.href).toBe(
      'https://api.notifications.service.gov.uk/v2/notifications/email'
    )
    expect(options.payload).toEqual({
      template_id: process.env.NOTIFY_OTP_TEMPLATE_ID,
      email_address: 'citizen@example.com',
      personalisation: { code: '123456', expiry_minutes: 15 }
    })
    const auth = options.headers.Authorization
    expect(auth).toMatch(/^Bearer /)
    // the JWT iss is the Notify service id: chars [len-73, len-37) of the key
    const apiKey = /** @type {string} */ (process.env.NOTIFY_API_KEY)
    const decoded = token.decode(auth.replace('Bearer ', ''))
    expect(decoded.decoded.payload.iss).toBe(
      apiKey.substring(apiKey.length - 73, apiKey.length - 37)
    )
  })

  it('fails loud at load when Notify is not configured', () => {
    jest.resetModules()
    jest.doMock('~/src/config/index.js', () => {
      const actual = jest.requireActual('~/src/config/index.js')
      return {
        config: {
          /** @param {string} key */
          get: (key) =>
            key === 'otp.notify.apiKey' ? '' : actual.config.get(key)
        }
      }
    })

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module load to trigger the boot-time guard
      require('~/src/repositories/notifier.js')
    }).toThrow(/NOTIFY_API_KEY/)

    jest.dontMock('~/src/config/index.js')
  })
})
