import { sendEmail } from '~/src/lib/notify.js'
import { OTPS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const { inject, requestCode, verify } = setupSigninFlow()

describe('one-time-code lifecycle', () => {
  it('burns the code after five wrong attempts — the real code is rejected afterwards', async () => {
    const code = await requestCode('uid-burn')

    for (let i = 0; i < 5; i++) {
      await verify('uid-burn', '000000')
    }

    expect(await verify('uid-burn', code)).toEqual({ status: 'invalid' })
  }, 15_000)

  it('a resend invalidates the old code and restores the attempt budget', async () => {
    const codeA = await requestCode('uid-resend')
    for (let i = 0; i < 4; i++) {
      await verify('uid-resend', '000000')
    }

    const codeB = await requestCode('uid-resend')

    expect(await verify('uid-resend', codeA)).toEqual({ status: 'invalid' })
    expect(await verify('uid-resend', codeB)).toEqual({
      status: 'phone-required'
    })
  }, 15_000)

  it('rejects an expired code in-app without waiting for the TTL sweep', async () => {
    const code = await requestCode('uid-expired')
    await db
      .collection(OTPS_COLLECTION_NAME)
      .updateOne(
        { uid: 'uid-expired' },
        { $set: { expireAt: new Date(Date.now() - 1000) } }
      )

    expect(await verify('uid-expired', code)).toEqual({ status: 'invalid' })
  })

  it('surfaces a Notify outage as a 500, and a resend recovers the interaction', async () => {
    jest.mocked(sendEmail).mockRejectedValueOnce(new Error('Notify is down'))

    const failed = await inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-outage', email: 'citizen@example.com' }
    })
    expect(failed.statusCode).toBe(500)

    const code = await requestCode('uid-outage')
    expect(await verify('uid-outage', code)).toEqual({
      status: 'phone-required'
    })
  })
})
