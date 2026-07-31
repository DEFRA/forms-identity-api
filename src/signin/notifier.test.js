import { token } from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { postJson } from '~/src/lib/fetch.js'
import { makeNotifier } from '~/src/signin/notifier.js'

jest.mock('~/src/lib/fetch.js')

describe('makeNotifier', () => {
  it('posts the code to Notify with a bearer JWT and expiry personalisation', async () => {
    const notifier = makeNotifier()

    await notifier.sendOtp('citizen@example.com', '123456')

    expect(postJson).toHaveBeenCalledTimes(1)
    const [url, options] = jest.mocked(postJson).mock.calls[0]
    expect(url.href).toBe(
      'https://api.notifications.service.gov.uk/v2/notifications/email'
    )
    expect(options.payload).toEqual({
      template_id: process.env.NOTIFY_OTP_TEMPLATE_ID,
      email_address: 'citizen@example.com',
      personalisation: { code: '123456', expiry_minutes: 15 }
    })
    const auth = /** @type {string} */ (
      /** @type {Record<string, string>} */ (options.headers).Authorization
    )
    expect(auth).toMatch(/^Bearer /)
    // the JWT iss is the Notify service id: chars [len-73, len-37) of the key
    const apiKey = /** @type {string} */ (process.env.NOTIFY_API_KEY)
    const decoded = token.decode(auth.replace('Bearer ', ''))
    expect(decoded.decoded.payload.iss).toBe(
      apiKey.substring(apiKey.length - 73, apiKey.length - 37)
    )
  })

  it('throws at construction when Notify is not configured', () => {
    const spy = jest.spyOn(config, 'get').mockImplementation((key) => {
      if (key === 'otp.notify.apiKey') {
        return ''
      }
      return jest.requireActual('~/src/config/index.js').config.get(key)
    })

    expect(() => makeNotifier()).toThrow(/NOTIFY_API_KEY/)

    spy.mockRestore()
  })
})
