import Hapi from '@hapi/hapi'

import { serviceJwt } from '~/src/auth/service-jwt.js'
import { requestLogger } from '~/src/helpers/logging/request-logger.js'
import {
  mintToken,
  startServiceAuthStub,
  stopServiceAuthStub
} from '~/test/helpers/service-auth.js'

/** @type {HapiServer[]} */
const servers = []

/**
 * Builds a bare server with the strategy registered directly, so each test
 * controls its own routes and auth options rather than the full app wiring.
 * requestLogger is registered first, matching the real server, because the
 * strategy logs through `server.logger` at registration.
 * @returns {Promise<HapiServer>}
 */
async function buildServer() {
  const server = Hapi.server()
  await server.register(requestLogger)
  await server.register(serviceJwt)
  server.route({
    method: 'GET',
    path: '/protected',
    handler: () => ({ ok: true })
  })
  server.route({
    method: 'GET',
    path: '/open',
    options: { auth: false },
    handler: () => ({ ok: true })
  })
  await server.initialize()
  servers.push(server)
  return server
}

/**
 * @param {HapiServer} server
 * @param {string} [token]
 */
const call = (server, token) =>
  server.inject({
    method: 'GET',
    url: '/protected',
    headers: token ? { authorization: `Bearer ${token}` } : {}
  })

beforeAll(startServiceAuthStub)

afterAll(async () => {
  // Stopping each server clears its JWKS cache timer, so the process can
  // exit rather than waiting on cached-key expiry.
  await Promise.all(servers.map((server) => server.stop()))
  await stopServiceAuthStub()
})

describe('service-jwt', () => {
  it('admits a token from the expected caller', async () => {
    const server = await buildServer()

    const res = await call(server, mintToken())

    expect(res.statusCode).toBe(200)
  })

  it('refuses a request with no token', async () => {
    const server = await buildServer()

    expect((await call(server)).statusCode).toBe(401)
  })

  it('refuses a token from another service', async () => {
    const server = await buildServer()
    const token = mintToken({
      sub: 'arn:aws:iam::000000000000:role/forms-runner'
    })

    expect((await call(server, token)).statusCode).toBe(401)
  })

  it('refuses a token addressed to another service', async () => {
    const server = await buildServer()

    expect(
      (await call(server, mintToken({ aud: 'forms-manager' }))).statusCode
    ).toBe(401)
  })

  it('refuses a token from another issuer', async () => {
    const server = await buildServer()
    const token = mintToken({ iss: 'https://someone-else.example' })

    expect((await call(server, token)).statusCode).toBe(401)
  })

  it('refuses an expired token', async () => {
    const server = await buildServer()

    expect(
      (await call(server, mintToken({ expiresInSeconds: -10 }))).statusCode
    ).toBe(401)
  })

  it('leaves a route that opts out open', async () => {
    const server = await buildServer()

    const res = await server.inject({ method: 'GET', url: '/open' })

    expect(res.statusCode).toBe(200)
  })
})

/**
 * @import { Server as HapiServer } from '@hapi/hapi'
 */
