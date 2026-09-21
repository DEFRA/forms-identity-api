import { TRANSPORT } from '~/src/constants.js'
import { sendEmail, sendSms } from '~/src/lib/notify.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({
  sendEmail: jest.fn(),
  sendSms: jest.fn()
}))
jest.mock('~/src/repositories/otps-repository.js')

const { inject } = setupSigninFlow()

describe('OTP endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('request OTP', () => {
    it('accepts valid OTP request defaulting to email', async () => {
      const res = await inject({
        method: 'POST',
        url: '/otp/request',
        payload: { uid: 'uid-1', target: 'a@b.com' }
      })

      expect(res.statusCode).toBe(204)
      expect(sendEmail).toHaveBeenCalledWith(
        'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
        'a@b.com',
        { code: expect.any(String), expiry_minutes: 15 }
      )
      expect(sendSms).not.toHaveBeenCalled()
    })

    it('accepts valid OTP request for SMS', async () => {
      const res = await inject({
        method: 'POST',
        url: '/otp/request',
        payload: {
          uid: 'uid-1',
          target: '+447507123456',
          transport: TRANSPORT.SMS,
          accountId: 'acc-1'
        }
      })

      expect(res.statusCode).toBe(204)
      expect(sendSms).toHaveBeenCalledWith(
        'ssssssss-ssss-ssss-ssss-ssssssssssss',
        '+447507123456',
        { code: expect.any(String), expiry_minutes: 15 }
      )
      expect(sendEmail).not.toHaveBeenCalled()
    })
  })
})
