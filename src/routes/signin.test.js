import Hapi from '@hapi/hapi'

import signinRoutes from '~/src/routes/signin.js'
import {
  completeSignup,
  findAccountById,
  requestOtp,
  verifyOtp
} from '~/src/services/signin-service.js'

jest.mock('~/src/services/signin-service.js', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  completeSignup: jest.fn(),
  findAccountById: jest.fn()
}))

/** Builds a server with the static routes (services are module-mocked) */
async function buildServer() {
  const server = Hapi.server()
  server.route(signinRoutes)
  await server.initialize()
  return server
}

describe('signin routes', () => {
  it('POST /otp/request validates and delegates', async () => {
    jest.mocked(requestOtp).mockResolvedValue({})
    const server = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-1', email: 'a@b.com' }
    })

    expect(res.statusCode).toBe(200)
    expect(requestOtp).toHaveBeenCalledWith({
      uid: 'uid-1',
      email: 'a@b.com'
    })
  })

  it('POST /otp/request rejects an invalid email with 400', async () => {
    const server = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-1', email: 'not-an-email' }
    })

    expect(res.statusCode).toBe(400)
    expect(requestOtp).not.toHaveBeenCalled()
  })

  it('POST /otp/verify passes the service result through', async () => {
    jest
      .mocked(verifyOtp)
      .mockResolvedValue({ status: 'signed-in', accountId: 'acc-1' })
    const server = await buildServer()

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
    jest.mocked(verifyOtp).mockResolvedValue({ status: 'invalid' })
    const server = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/otp/verify',
      payload: { uid: 'uid-1', code: 'definitely wrong' }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ status: 'invalid' })
  })

  it('POST /accounts delegates to completeSignup', async () => {
    jest
      .mocked(completeSignup)
      .mockResolvedValue({ status: 'signed-in', accountId: 'acc-2' })
    const server = await buildServer()

    const res = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-1', phone: '07911 123456' }
    })

    expect(res.statusCode).toBe(200)
    expect(completeSignup).toHaveBeenCalledWith({
      uid: 'uid-1',
      phone: '07911 123456'
    })
  })

  it('GET /accounts/{id} returns claims data or 404', async () => {
    jest.mocked(findAccountById).mockResolvedValue(
      /** @type {never} */ ({
        _id: 'acc-1',
        email: 'a@b.com',
        emailVerified: true
      })
    )
    const server = await buildServer()

    const found = await server.inject({
      method: 'GET',
      url: '/accounts/acc-1'
    })
    expect(found.statusCode).toBe(200)
    expect(JSON.parse(found.payload)).toEqual({
      id: 'acc-1',
      email: 'a@b.com',
      emailVerified: true
    })

    const Boom = jest.requireActual('@hapi/boom')
    jest.mocked(findAccountById).mockRejectedValue(Boom.notFound())
    const missing = await server.inject({
      method: 'GET',
      url: '/accounts/nope'
    })
    expect(missing.statusCode).toBe(404)
  })
})
