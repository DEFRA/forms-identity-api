import { createHash, timingSafeEqual } from 'node:crypto'

import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'

export const TEST_OTP_SECRET = 'test-otp-secret'

const MIN_SECRET_LENGTH = 32
const BEARER_PREFIX = 'Bearer '

/**
 * @param {string} value
 */
function digest(value) {
  return createHash('sha256').update(value).digest()
}

/**
 * Checks the shared secret that an automated test sends to read a sign-in
 * code. The test and this service hold the same value.
 *
 * The secret is checked when the plugin registers, so that a deployment with
 * a missing or short secret stops at boot.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const testOtpSecret = {
  plugin: {
    name: TEST_OTP_SECRET,
    register(server) {
      const secret = config.get('otp.testRead.secret')

      if (secret.length < MIN_SECRET_LENGTH) {
        throw new Error(
          `OTP_TEST_READ_SECRET must have ${MIN_SECRET_LENGTH} characters or more when OTP_TEST_READ_ENABLED is on`
        )
      }

      const expected = digest(secret)

      server.auth.scheme(TEST_OTP_SECRET, () => ({
        /**
         * @param {Request} request
         * @param {ResponseToolkit} h
         */
        authenticate(request, h) {
          const header = request.headers.authorization

          if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
            throw Boom.unauthorized(null, 'Bearer')
          }

          // Both values are hashed first. The digests have the same length,
          // which timingSafeEqual needs, and the time the comparison takes
          // tells a caller nothing about the secret.
          const sent = digest(header.slice(BEARER_PREFIX.length))

          if (!timingSafeEqual(sent, expected)) {
            throw Boom.unauthorized(null, 'Bearer')
          }

          return h.authenticated({ credentials: {} })
        }
      }))

      server.auth.strategy(TEST_OTP_SECRET, TEST_OTP_SECRET)
    }
  }
}

/**
 * @import { Request, ResponseToolkit, ServerRegisterPluginObject } from '@hapi/hapi'
 */
