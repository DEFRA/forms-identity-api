import Hapi from '@hapi/hapi'

import { PURPOSE, TRANSPORT } from '~/src/constants.js'
import otpRoutes from '~/src/routes/otp.js'
import { requestOtp } from '~/src/services/otp-service.js'

jest.mock('~/src/services/otp-service.js', () => ({
  requestOtp: jest.fn()
}))

/** Builds a server with the static routes (services are module-mocked) */
async function buildServer() {
  const server = Hapi.server()
  server.route([...otpRoutes])
  await server.initialize()
  return server
}

describe('otp routes', () => {
  describe('POST /otp/request throws for invalid parameter combinations', () => {
    it('Purpose of signin email but transport of SMS', async () => {
      const server = await buildServer()

      const res = await server.inject({
        method: 'POST',
        url: '/otp/request',
        payload: {
          uid: 'uid-1',
          purpose: PURPOSE.SIGNIN_VERIFY_EMAIL,
          transport: TRANSPORT.SMS
        }
      })

      expect(res.statusCode).toBe(400)
      expect(requestOtp).not.toHaveBeenCalled()
    })

    it('Purpose of change account email verify email but transport of SMS', async () => {
      const server = await buildServer()

      const res = await server.inject({
        method: 'POST',
        url: '/otp/request',
        payload: {
          uid: 'uid-1',
          purpose: PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
          transport: TRANSPORT.SMS,
          accountId: 'acc-id'
        }
      })

      expect(res.statusCode).toBe(400)
      expect(requestOtp).not.toHaveBeenCalled()
    })

    it('Purpose of change account email verify phone but transport of email', async () => {
      const server = await buildServer()

      const res = await server.inject({
        method: 'POST',
        url: '/otp/request',
        payload: {
          uid: 'uid-1',
          purpose: PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE,
          transport: TRANSPORT.EMAIL,
          target: 'test@email.com',
          accountId: 'acc-id'
        }
      })

      expect(res.statusCode).toBe(400)
      expect(requestOtp).not.toHaveBeenCalled()
    })

    it('Purpose of change account phone verify email but transport of SMS', async () => {
      const server = await buildServer()

      const res = await server.inject({
        method: 'POST',
        url: '/otp/request',
        payload: {
          uid: 'uid-1',
          purpose: PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL,
          transport: TRANSPORT.SMS,
          accountId: 'acc-id'
        }
      })

      expect(res.statusCode).toBe(400)
      expect(requestOtp).not.toHaveBeenCalled()
    })
  })
})
