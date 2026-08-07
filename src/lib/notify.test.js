import { token } from '@hapi/jwt'

import { postJson } from '~/src/lib/fetch.js'
import { sendEmail } from '~/src/lib/notify.js'

jest.mock('~/src/lib/fetch.js')

// The uuids embedded in jest.setup.js's NOTIFY_API_KEY, asserted as literals
// so the extraction offsets are verified rather than re-derived
const SERVICE_ID = 'zzzzzzzz-zzzz-zzzz-zzzz-servicezzzzz'
const API_KEY_ID = 'zzzzzzzz-zzzz-zzzz-zzzz-apikeyzzzzzz'

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
      personalisation: { code: '123456', expiry_minutes: 15 },
      // a configured reply-to makes the mail more likely to reach an inbox
      // rather than a spam folder
      email_reply_to_id: process.env.NOTIFY_REPLY_TO_ID
    })
    const auth = options.headers.Authorization
    expect(auth).toMatch(/^Bearer /)

    const artifacts = token.decode(auth.replace('Bearer ', ''))
    expect(artifacts.decoded.payload.iss).toBe(SERVICE_ID)
    // signed with the key id (the trailing uuid), per the Notify API contract
    expect(() => {
      token.verifySignature(artifacts, { key: API_KEY_ID, algorithm: 'HS256' })
    }).not.toThrow()
    expect(() => {
      token.verifySignature(artifacts, { key: SERVICE_ID, algorithm: 'HS256' })
    }).toThrow()
  })

  it('refuses to boot when no Notify API key is configured', async () => {
    const saved = process.env.NOTIFY_API_KEY
    // empty rather than deleted: the isolated reload re-runs dotenv, which
    // would repopulate an unset variable from a local .env
    process.env.NOTIFY_API_KEY = ''

    try {
      await jest.isolateModulesAsync(async () => {
        await expect(import('~/src/lib/notify.js')).rejects.toThrow(
          'GOV.UK Notify not configured'
        )
      })
    } finally {
      process.env.NOTIFY_API_KEY = saved
    }
  })
})
