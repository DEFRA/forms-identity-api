import Hapi from '@hapi/hapi'

import { config } from '~/src/config/index.js'
import { PURPOSE } from '~/src/constants.js'
import { testOtp } from '~/src/plugins/test-otp.js'
import { findTestOtp } from '~/src/services/test-otp-service.js'

jest.mock('~/src/services/test-otp-service.js')

const SECRET = config.get('otp.testRead.secret')

/** Builds a bare server with the plugin, which holds the strategy and its route */
async function buildServer() {
  const server = Hapi.server()
  await server.register(testOtp)
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
    url: `/test/otp/perf-1@example.forms.defra.gov.uk/${PURPOSE.SIGNIN_VERIFY_EMAIL}`,
    headers: authorization ? { authorization } : {}
  })
}

describe('test OTP', () => {
  beforeEach(() => {
    jest.mocked(findTestOtp).mockResolvedValue({ code: '123456' })
  })

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
