import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import http from 'node:http'

import Hapi from '@hapi/hapi'

import { expectedSubject, serviceJwt } from '~/src/auth/service-jwt.js'
import { config } from '~/src/config/index.js'

const KID = 'test-rs256'
const ISSUER = 'https://local.tokens.sts.global.api.aws'
const AUDIENCE = 'forms-identity-api'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048
})

/** @type {Server} */
let jwksServer
/** @type {number} */
let jwksPort
/** @type {HapiServer[]} */
const servers = []

/**
 * @param {unknown} value
 */
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * @param {{ sub?: string, aud?: string, iss?: string, expiresInSeconds?: number }} [overrides]
 */
function mint(overrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: KID })
  const payload = encode({
    sub: overrides.sub ?? expectedSubject(),
    aud: overrides.aud ?? AUDIENCE,
    iss: overrides.iss ?? ISSUER,
    iat: now,
    exp: now + (overrides.expiresInSeconds ?? 300)
  })
  const signingInput = `${header}.${payload}`
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(signingInput),
    privateKey
  ).toString('base64url')

  return `${signingInput}.${signature}`
}

/**
 * Builds a bare server with the strategy registered directly, so each test
 * controls its own routes and auth options rather than the full app wiring.
 * @returns {Promise<HapiServer>}
 */
async function buildServer() {
  const server = Hapi.server()
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

beforeAll(async () => {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })

  jwksServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] })
    )
  })

  await /** @type {Promise<void>} */ (
    new Promise((resolve) =>
      jwksServer.listen(0, '127.0.0.1', () => {
        resolve()
      })
    )
  )
  jwksPort = /** @type {AddressInfo} */ (jwksServer.address()).port

  config.set(
    'auth.jwt.jwksUri',
    `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`
  )
  config.set('auth.jwt.issuer', ISSUER)
  config.set('auth.jwt.audience', AUDIENCE)
})

afterAll(async () => {
  // Stopping each server clears its JWKS cache timer, so the process can
  // exit rather than waiting on cached-key expiry.
  await Promise.all(servers.map((server) => server.stop()))
  await new Promise((resolve) => jwksServer.close(resolve))
})

describe('service-jwt', () => {
  it('builds the caller subject from the account and the allowed caller', () => {
    expect(expectedSubject()).toBe(
      `arn:aws:iam::${config.get('auth.awsAccount')}:role/${config.get('auth.allowedCaller')}`
    )
  })

  it('admits a token from the expected caller', async () => {
    const server = await buildServer()

    const res = await call(server, mint())

    expect(res.statusCode).toBe(200)
  })

  it('refuses a request with no token', async () => {
    const server = await buildServer()

    expect((await call(server)).statusCode).toBe(401)
  })

  it('refuses a token from another service', async () => {
    const server = await buildServer()
    const token = mint({ sub: 'arn:aws:iam::000000000000:role/forms-runner' })

    expect((await call(server, token)).statusCode).toBe(401)
  })

  it('refuses a token addressed to another service', async () => {
    const server = await buildServer()

    expect(
      (await call(server, mint({ aud: 'forms-manager' }))).statusCode
    ).toBe(401)
  })

  it('refuses a token from another issuer', async () => {
    const server = await buildServer()
    const token = mint({ iss: 'https://someone-else.example' })

    expect((await call(server, token)).statusCode).toBe(401)
  })

  it('refuses an expired token', async () => {
    const server = await buildServer()

    expect(
      (await call(server, mint({ expiresInSeconds: -10 }))).statusCode
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
 * @import { Server } from 'node:http'
 * @import { AddressInfo } from 'node:net'
 */
