import crypto from 'node:crypto'

import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'
import { createAccount } from '~/src/services/signin-service.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const { inject, requestCode, verify } = setupSigninFlow()

describe('citizen sign-in journeys', () => {
  it('accepts a code whose leading zeros are part of it', async () => {
    // the low end of the range is padded, not skipped, so the citizen is
    // emailed "000001" and has to type all six characters back
    const randomInt = jest
      .spyOn(crypto, 'randomInt')
      .mockReturnValue(/** @type {never} */ (1))
    const code = await requestCode('uid-padded')
    randomInt.mockRestore()

    expect(code).toBe('000001')
    expect(await verify('uid-padded', code)).toEqual({
      status: 'phone-required'
    })
  })

  it('refuses the same code typed without its leading zeros', async () => {
    // we never pad on a citizen's behalf: "1" is not "000001", it is a code
    // of the wrong shape, answered as invalid without spending a guess
    const randomInt = jest
      .spyOn(crypto, 'randomInt')
      .mockReturnValue(/** @type {never} */ (1))
    const code = await requestCode('uid-shortform')
    randomInt.mockRestore()

    expect(code).toBe('000001')

    const res = await inject({
      method: 'POST',
      url: '/otp/verify',
      payload: { uid: 'uid-shortform', code: '1' }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ status: 'invalid' })

    // and the real code still works afterwards — the attempt was not spent
    expect(await verify('uid-shortform', code)).toEqual({
      status: 'phone-required'
    })
  })

  it('signs a new user up end to end, with four fumbled attempts on the way', async () => {
    const code = await requestCode('uid-signup', 'Citizen@Example.com')

    const shown = await inject({ method: 'GET', url: '/otp/uid-signup' })
    expect(JSON.parse(shown.payload)).toEqual({ email: 'citizen@example.com' })

    for (let i = 0; i < 4; i++) {
      expect(await verify('uid-signup', '000000')).toEqual({
        status: 'invalid'
      })
    }
    expect(await verify('uid-signup', code)).toEqual({
      status: 'phone-required'
    })

    const completed = await inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-signup', phone: '07911 123456' }
    })
    const { status, accountId } = JSON.parse(completed.payload)
    expect(status).toBe('signed-in')

    const claims = await inject({
      method: 'GET',
      url: `/accounts/${accountId}`
    })
    expect(JSON.parse(claims.payload)).toEqual({
      id: accountId,
      email: 'citizen@example.com'
    })

    const stored = await db
      .collection(ACCOUNTS_COLLECTION_NAME)
      .findOne({ _id: /** @type {never} */ (accountId) })
    expect(stored).toMatchObject({
      email: 'citizen@example.com',
      phone: '+447911123456',
      status: 'active'
    })
  })

  it('signs an existing account straight in from the code', async () => {
    const account = await createAccount('citizen@example.com', '+447911123456')

    const code = await requestCode('uid-returning')

    expect(await verify('uid-returning', code)).toEqual({
      status: 'signed-in',
      accountId: account._id
    })
    const otp = await db
      .collection(OTPS_COLLECTION_NAME)
      .findOne({ uid: 'uid-returning' })
    expect(otp?.consumed).toBe(true)
  })

  it('rejects a landline at the phone step without spending the interaction', async () => {
    const code = await requestCode('uid-landline')
    await verify('uid-landline', code)

    const landline = await inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-landline', phone: '020 7946 0000' }
    })
    expect(JSON.parse(landline.payload)).toEqual({ status: 'invalid-phone' })

    const mobile = await inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-landline', phone: '07911 123456' }
    })
    expect(JSON.parse(mobile.payload)).toMatchObject({ status: 'signed-in' })
  })

  it('stops non-telephone input at route validation with 400', async () => {
    const res = await inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-garbage', phone: 'not a number' }
    })

    expect(res.statusCode).toBe(400)
  })

  it('rejects completion for an interaction that never verified', async () => {
    await requestCode('uid-unverified')

    const res = await inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-unverified', phone: '07911 123456' }
    })

    expect(JSON.parse(res.payload)).toEqual({ status: 'invalid' })
  })

  it('returns 404 for unknown interactions and accounts', async () => {
    const otp = await inject({ method: 'GET', url: '/otp/uid-none' })
    expect(otp.statusCode).toBe(404)

    const account = await inject({ method: 'GET', url: '/accounts/acc-none' })
    expect(account.statusCode).toBe(404)
  })
})
