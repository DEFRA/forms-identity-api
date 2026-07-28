import { token } from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { postJson } from '~/src/lib/fetch.js'
import { makeNotifier } from '~/src/otp/notifier.js'

// Mock the fetch layer so no test ever touches the network.
jest.mock('~/src/lib/fetch.js')

const NOTIFICATIONS_URL = new URL(
  '/v2/notifications/email',
  'https://api.notifications.service.gov.uk'
)

describe('gov.uk notify notifier', () => {
  beforeEach(() => {
    jest.mocked(postJson).mockResolvedValue({
      response: /** @type {object} */ ({ statusCode: 201 }),
      body: { id: 'notif-1' }
    })
  })

  it('posts the code and expiry to the Notify email API via the configured template', async () => {
    const notifier = makeNotifier()

    await notifier.sendOtp('citizen@example.com', '123456')

    // ttlSeconds default 900 → 15 minutes, computed from config (never drifts).
    expect(postJson).toHaveBeenCalledWith(NOTIFICATIONS_URL, {
      payload: {
        template_id: config.get('otp.notify.templateId'),
        email_address: 'citizen@example.com',
        personalisation: { code: '123456', expiry_minutes: 15 }
      },
      headers: {
        Authorization: expect.stringMatching(/^Bearer /)
      }
    })
  })

  it('signs the bearer token with the ids extracted from the api key', async () => {
    const notifier = makeNotifier()

    await notifier.sendOtp('citizen@example.com', '123456')

    const apiKey = config.get('otp.notify.apiKey')
    const apiKeyId = apiKey.substring(apiKey.length - 36)
    const serviceId = apiKey.substring(apiKey.length - 73, apiKey.length - 37)

    const [, options] =
      /** @type {[URL, { headers?: { Authorization?: string } }]} */ (
        jest.mocked(postJson).mock.calls[0]
      )
    const jwt = String(options.headers?.Authorization).replace('Bearer ', '')
    const decoded = token.decode(jwt)

    // Verifiable with the api key id and issued by the service id — the same
    // scheme notifications-node-client uses.
    expect(() => {
      token.verify(decoded, { key: apiKeyId, algorithm: 'HS256' })
    }).not.toThrow()
    expect(decoded.decoded.payload.iss).toBe(serviceId)
  })

  it('fails loud when the api key is missing (never silently no-ops)', () => {
    const original = config.get('otp.notify.apiKey')
    config.set('otp.notify.apiKey', '')

    expect(() => makeNotifier()).toThrow(/Notify not configured/)

    config.set('otp.notify.apiKey', original)
  })

  it('fails loud when the template id is missing', () => {
    const original = config.get('otp.notify.templateId')
    config.set('otp.notify.templateId', '')

    expect(() => makeNotifier()).toThrow(/Notify not configured/)

    config.set('otp.notify.templateId', original)
  })
})
