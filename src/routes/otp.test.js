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

describe('POST /otp/request serviceName validation', () => {
  const basePayload = {
    uid: 'uid-1',
    purpose: PURPOSE.SIGNIN_VERIFY_EMAIL,
    transport: TRANSPORT.EMAIL,
    target: 'user@example.com'
  }

  beforeEach(() => {
    jest.mocked(requestOtp).mockResolvedValue(/** @type {any} */ ({}))
  })

  it.each([
    'Apply for a fishing licence',
    "Report a dead bird (England & Wales) - Dad's form",
    'Gwneud cais am drwydded bysgota â chŵn',
    'Apply: step 2, e.g. renewals. Done',
    'a'.repeat(150),
    '<script>alert(1)</script>',
    'name" onmouseover="x',
    '$' + '{x}',
    'a; drop table',
    '((x)) {{y}}',
    ''
  ])('accepts %s', async (serviceName) => {
    const server = await buildServer()
    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { ...basePayload, serviceName }
    })
    expect(res.statusCode).toBe(200)
  })

  it.each([
    ['https://evil.example', ''],
    ['Visit evil.com to claim', 'Visit to claim'],
    ['www.evil form', 'form'],
    ['Files at ftp://files', 'Files at'],
    ['See //evil.co.uk/path now', 'See now'],
    ['Contact SUPPORT.GOV.UK', 'Contact'],
    ['Click javascript:alert(1)', 'Click'],
    ['Apply: step 2, e.g. renewals. Done', 'Apply: step 2, e.g. renewals. Done']
  ])('strips URL-like words from %s', async (serviceName, expected) => {
    const server = await buildServer()
    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { ...basePayload, serviceName }
    })
    expect(res.statusCode).toBe(200)
    expect(requestOtp).toHaveBeenCalledWith(
      'uid-1',
      'user@example.com',
      TRANSPORT.EMAIL,
      PURPOSE.SIGNIN_VERIFY_EMAIL,
      expect.objectContaining({ serviceName: expected })
    )
  })

  it('truncates a serviceName over 150 characters', async () => {
    const server = await buildServer()
    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { ...basePayload, serviceName: 'a'.repeat(200) }
    })
    expect(res.statusCode).toBe(200)
    expect(requestOtp).toHaveBeenCalledWith(
      'uid-1',
      'user@example.com',
      TRANSPORT.EMAIL,
      PURPOSE.SIGNIN_VERIFY_EMAIL,
      expect.objectContaining({ serviceName: 'a'.repeat(150) })
    )
  })
})
