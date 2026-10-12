import { createHash, timingSafeEqual } from 'node:crypto'

import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'

export const TEST_OTP_SECRET = 'test-otp-secret'

/**
 * @param {string} value
 */
function digest(value) {
  return createHash('sha256').update(value).digest()
}

/**
 * Whether two strings are equal. Both values are hashed first. The digests
 * have the same length, which timingSafeEqual needs, and the time the
 * comparison takes tells a caller nothing about either value.
 * @param {string} a
 * @param {string} b
 */
function secureEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b))
}

/**
 * Checks the shared secret that an automated test sends to read a sign-in
 * code. The test and this service hold the same value.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const testOtpSecret = {
  plugin: {
    name: TEST_OTP_SECRET,
    register(server) {
      const expected = `Bearer ${config.get('otp.testRead.secret')}`

      server.auth.scheme(TEST_OTP_SECRET, () => ({
        /**
         * @param {Request} request
         * @param {ResponseToolkit} h
         */
        authenticate(request, h) {
          const sent = String(request.headers.authorization)

          if (!secureEqual(sent, expected)) {
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
