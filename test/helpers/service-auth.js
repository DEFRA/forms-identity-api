import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import http from 'node:http'

import { config } from '~/src/config/index.js'

const KID = 'test-rs256'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048
})

/** @type {Server} */
let jwksServer

/**
 * @param {unknown} value
 */
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * Starts an in-process JWKS server and points config at it, so a suite's
 * server.initialize() finds a real key set to warm its cache from — the same
 * verification path production runs, rather than a test-only bypass.
 * @returns {Promise<void>}
 */
export async function startServiceAuthStub() {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })

  jwksServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] })
    )
  })

  await /** @type {Promise<void>} */ (
    new Promise((resolve, reject) => {
      jwksServer.once('error', reject)
      jwksServer.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })
  )

  const { port } = /** @type {AddressInfo} */ (jwksServer.address())
  config.set(
    'auth.jwt.jwksUri',
    `http://127.0.0.1:${port}/.well-known/jwks.json`
  )
}

/**
 * Closes the in-process JWKS server, so its cache timer does not keep Jest
 * alive after the suite finishes.
 * @returns {Promise<void>}
 */
export async function stopServiceAuthStub() {
  await /** @type {Promise<void>} */ (
    new Promise((resolve) => {
      jwksServer.close(() => {
        resolve()
      })
    })
  )
}

/**
 * Mints an RS256 token that verifies against the in-process JWKS server, so
 * tests present a real caller credential rather than bypassing the strategy.
 * @param {{ sub?: string, aud?: string, iss?: string, expiresInSeconds?: number }} [overrides]
 * @returns {string}
 */
export function mintToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: KID })
  const payload = encode({
    sub: overrides.sub ?? config.get('auth.allowedSubject'),
    aud: overrides.aud ?? config.get('auth.jwt.audience'),
    iss: overrides.iss ?? config.get('auth.jwt.issuer'),
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
 * @import { Server } from 'node:http'
 * @import { AddressInfo } from 'node:net'
 */
