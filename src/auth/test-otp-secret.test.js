import Hapi from '@hapi/hapi'

import { TEST_OTP_SECRET, testOtpSecret } from '~/src/auth/test-otp-secret.js'
import { config } from '~/src/config/index.js'

const SECRET = config.get('otp.testRead.secret')

/** Builds a bare server with the strategy and one route that uses it */
async function buildServer() {
  const server = Hapi.server()
  await server.register(testOtpSecret)
  server.route({
    method: 'GET',
    path: '/protected',
    options: { auth: TEST_OTP_SECRET },
    handler: () => ({ ok: true })
  })
  await server.initialize()
  return server
}

/**
 * @param {string} [authorization]
 */
async function call(authorization) {
  const server = await buildServer()

  return server.inject({
    method: 'GET',
    url: '/protected',
    headers: authorization ? { authorization } : {}
  })
}

describe('test OTP secret', () => {
  it('accepts the secret as a bearer token', async () => {
    const res = await call(`Bearer ${SECRET}`)

    expect(res.statusCode).toBe(200)
  })

  it.each([
    ['no header', undefined],
    ['a different secret of the same length', `Bearer ${'b'.repeat(32)}`],
    ['a shorter value', 'Bearer short'],
    ['a longer value', `Bearer ${SECRET}x`],
    ['an empty value', 'Bearer '],
    ['the secret with no scheme', SECRET],
    ['the secret with another scheme', `Basic ${SECRET}`]
  ])('refuses %s', async (_name, authorization) => {
    const res = await call(authorization)

    expect(res.statusCode).toBe(401)
  })
})
