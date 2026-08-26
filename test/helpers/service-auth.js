import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'

import nock from 'nock'

import { config } from '~/src/config/index.js'

const KID = 'test-rs256'

// A fixed fake origin rather than an ephemeral port: nock intercepts the
// request inside the process, so no socket ever opens and the URI can be a
// constant.
const JWKS_ORIGIN = 'http://sts.test'
const JWKS_PATH = '/.well-known/jwks.json'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048
})

/**
 * @param {unknown} value
 */
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * Intercepts the JWKS fetch with nock and points config at the fake origin,
 * so a suite's server.initialize() finds a key set to warm its cache from.
 * The Wreck client path still runs; only the transport is intercepted.
 */
export function startServiceAuthStub() {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })

  if (!nock.isActive()) {
    nock.activate()
  }

  // persist(): the key set is fetched once per built server, and a suite can
  // build several — a one-shot interceptor would die after the first.
  nock(JWKS_ORIGIN)
    .persist()
    .get(JWKS_PATH)
    .reply(200, { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] })

  config.set('auth.jwt.jwksUri', `${JWKS_ORIGIN}${JWKS_PATH}`)
}

/**
 * Removes the interceptor and unpatches the http module.
 */
export function stopServiceAuthStub() {
  nock.cleanAll()
  nock.restore()
}

/**
 * Mints an RS256 token that verifies against the intercepted JWKS, so tests
 * present a real caller credential rather than bypassing the strategy.
 * @param {{ sub?: string, aud?: string, iss?: string, expiresInSeconds?: number }} [overrides]
 * @returns {string}
 */
export function mintToken(overrides = {}) {
  // expiresInSeconds is an input for computing exp rather than a claim, so
  // it is split off before the rest spreads into the payload
  const { expiresInSeconds = 300, ...claims } = overrides
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: KID })
  const payload = encode({
    sub: config.get('auth.allowedSubject'),
    aud: config.get('auth.jwt.audience'),
    iss: config.get('auth.jwt.issuer'),
    iat: now,
    exp: now + expiresInSeconds,
    ...claims
  })
  const signingInput = `${header}.${payload}`
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(signingInput),
    privateKey
  ).toString('base64url')

  return `${signingInput}.${signature}`
}
