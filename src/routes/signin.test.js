import Hapi from '@hapi/hapi'

import { signinRoutes } from '~/src/routes/signin.js'

/** Builds a server with fake services injected */
async function buildServer() {
  const otpService = {
    requestOtp: jest.fn().mockResolvedValue({}),
    verifyOtp: jest.fn().mockResolvedValue({ status: 'invalid' }),
    completeSignup: jest.fn().mockResolvedValue({ status: 'invalid' })
  }
  const accountsService = {
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    createAccount: jest.fn()
  }
  const server = Hapi.server()
  server.route(
    signinRoutes(
      /** @type {never} */ (otpService),
      /** @type {never} */ (accountsService)
    )
  )
  await server.initialize()
  return { server, otpService, accountsService }
}

describe('signin routes', () => {
  it('POST /otp/request validates and delegates', async () => {
    const { server, otpService } = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-1', email: 'a@b.com' }
    })

    expect(res.statusCode).toBe(200)
    expect(otpService.requestOtp).toHaveBeenCalledWith({
      uid: 'uid-1',
      email: 'a@b.com'
    })
  })

  it('POST /otp/request rejects an invalid email with 400', async () => {
    const { server, otpService } = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-1', email: 'not-an-email' }
    })

    expect(res.statusCode).toBe(400)
    expect(otpService.requestOtp).not.toHaveBeenCalled()
  })

  it('POST /otp/verify passes the service result through', async () => {
    const { server, otpService } = await buildServer()
    otpService.verifyOtp.mockResolvedValue({
      status: 'signed-in',
      accountId: 'acc-1'
    })

    const res = await server.inject({
      method: 'POST',
      url: '/otp/verify',
      payload: { uid: 'uid-1', code: '123456' }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({
      status: 'signed-in',
      accountId: 'acc-1'
    })
  })

  it('POST /otp/verify tolerates arbitrary code text (backend enforces)', async () => {
    const { server } = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/otp/verify',
      payload: { uid: 'uid-1', code: 'definitely wrong' }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ status: 'invalid' })
  })

  it('POST /accounts delegates to completeSignup', async () => {
    const { server, otpService } = await buildServer()
    otpService.completeSignup.mockResolvedValue({
      status: 'signed-in',
      accountId: 'acc-2'
    })

    const res = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-1', phone: '07911 123456' }
    })

    expect(res.statusCode).toBe(200)
    expect(otpService.completeSignup).toHaveBeenCalledWith({
      uid: 'uid-1',
      phone: '07911 123456'
    })
  })

  it('GET /accounts/{id} returns claims data or 404', async () => {
    const { server, accountsService } = await buildServer()
    accountsService.findById.mockResolvedValue({
      _id: 'acc-1',
      email: 'a@b.com'
    })

    const found = await server.inject({
      method: 'GET',
      url: '/accounts/acc-1'
    })
    expect(found.statusCode).toBe(200)
    expect(JSON.parse(found.payload)).toEqual({
      id: 'acc-1',
      email: 'a@b.com'
    })

    accountsService.findById.mockResolvedValue(null)
    const missing = await server.inject({
      method: 'GET',
      url: '/accounts/nope'
    })
    expect(missing.statusCode).toBe(404)
  })
})
