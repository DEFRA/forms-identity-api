import { createServer } from '~/src/api/server.js'

jest.mock('~/src/mongo.js')

describe('oidc plugin', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  it('serves the OIDC discovery document with the configured public issuer', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/.well-known/openid-configuration'
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.issuer).toBe('http://localhost:3002')
    expect(body.token_endpoint).toContain('/token')
    expect(body.jwks_uri).toContain('/jwks')
  })

  it('exposes the provider on server.app for other plugins', () => {
    expect(server.app.oidcProvider).toBeDefined()
    expect(server.app.oidcProvider.issuer).toBe('http://localhost:3002')
  })

  it('leaves the platform /health route working (catch-all does not shadow it)', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({ message: 'success' })
  })

  it('rejects an invalid /otp/request payload with 400, not 500', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: {}
    })

    expect(response.statusCode).toBe(400)
  })

  it('rejects a /interaction/{uid}/complete request with a malformed payload with 400, not 500', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/interaction/some-uid/complete',
      payload: { email: 'not-an-email' } // missing code, bad email
    })

    expect(response.statusCode).toBe(400)
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
