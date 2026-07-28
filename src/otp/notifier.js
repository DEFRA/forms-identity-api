import { token } from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { postJson } from '~/src/lib/fetch.js'

const NOTIFICATIONS_URL = new URL(
  '/v2/notifications/email',
  'https://api.notifications.service.gov.uk'
)

const API_KEY_SUBSTRING_REDUCTION = 36
const SERVICE_ID_SUBSTRING_REDUCTION = 73
const SERVICE_ID_SUBSTRING_REDUCTION_2 = 37

/**
 * @typedef {object} Notifier
 * @property {(email: string, code: string) => Promise<void>} sendOtp - delivers a one-time code
 */

/**
 * Sign-in one-time-code delivery. Always the real GOV.UK Notify API — the
 * delivery mechanism is not switchable; production and local dev behave
 * identically. Credentials/IDs are injected per environment (secret key +
 * template id), never boot-generated or defaulted.
 *
 * Calls the Notify REST API directly via `~/src/lib/fetch.js` (Wreck), the
 * same pattern as forms-manager: Wreck routes through the CDP egress
 * `ProxyAgent`, which `notifications-node-client` does not.
 *
 * The Notify template must contain these personalisation placeholders:
 *   ((code))           -> the 6-digit one-time code
 *   ((expiry_minutes)) -> derived below from otp.ttlSeconds, so the "expires in
 *                         N minutes" line can never drift from the configured TTL.
 * @returns {Notifier}
 */
export function makeNotifier() {
  const apiKey = config.get('otp.notify.apiKey')
  const templateId = config.get('otp.notify.templateId')

  if (!apiKey || !templateId) {
    // Fail loud rather than silently never deliver (same posture as OIDC keys).
    throw new Error(
      'GOV.UK Notify not configured: set NOTIFY_API_KEY and NOTIFY_OTP_TEMPLATE_ID (required in every environment)'
    )
  }

  // Extract the two uuids from the Notify API key
  // See https://github.com/alphagov/notifications-node-client/blob/main/client/api_client.js#L17
  const apiKeyId = apiKey.substring(
    apiKey.length - API_KEY_SUBSTRING_REDUCTION,
    apiKey.length
  )
  const serviceId = apiKey.substring(
    apiKey.length - SERVICE_ID_SUBSTRING_REDUCTION,
    apiKey.length - SERVICE_ID_SUBSTRING_REDUCTION_2
  )

  const expiryMinutes = Math.round(config.get('otp.ttlSeconds') / 60)

  return {
    /**
     * Sends the one-time code email via GOV.UK Notify
     * @param {string} email
     * @param {string} code
     */
    async sendOtp(email, code) {
      await postJson(NOTIFICATIONS_URL, {
        payload: {
          template_id: templateId,
          email_address: email,
          personalisation: { code, expiry_minutes: expiryMinutes }
        },
        headers: {
          Authorization: 'Bearer ' + createToken(serviceId, apiKeyId)
        }
      })
    }
  }
}

/**
 * Creates a Notify API JWT (iss = service id, signed with the API key id)
 * @param {string} iss - Notify service id
 * @param {string} secret - Notify API key id
 */
function createToken(iss, secret) {
  const iat = Math.round(Date.now() / 1000)

  return token.generate({ iss, iat }, secret, {
    header: { typ: 'JWT', alg: 'HS256' }
  })
}
