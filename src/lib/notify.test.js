import { token } from '@hapi/jwt'

import { postJson } from '~/src/lib/fetch.js'
import { sendEmail } from '~/src/lib/notify.js'

jest.mock('~/src/lib/fetch.js')

describe('notify client', () => {
  it('posts an email to Notify with a bearer JWT', async () => {
    await sendEmail('template-1', 'citizen@example.com', {
      code: '123456',
      expiry_minutes: 15
    })

    expect(postJson).toHaveBeenCalledTimes(1)
    const [url, options] =
      /** @type {[URL, { payload: object, headers: Record<string, string> }]} */ (
        jest.mocked(postJson).mock.calls[0]
      )
    expect(url.href).toBe(
      'https://api.notifications.service.gov.uk/v2/notifications/email'
    )
    expect(options.payload).toEqual({
      template_id: 'template-1',
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
})
