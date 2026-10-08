import Joi from 'joi'

import { TEST_OTP_SECRET } from '~/src/auth/test-otp-secret.js'
import { findTestOtp } from '~/src/services/test-otp-service.js'

/**
 * Routes for automated tests. The server adds them only while
 * otp.testRead.enabled is on, so they are kept out of the routes index.
 *
 * Each route names the test secret strategy. The server default accepts
 * forms-identity-ui only, and a test is a different caller.
 */
export default [
  /**
   * The sign-in code for an interaction, in plain text. `uid` is the value
   * that forms-identity-ui sends on /otp/request: the SHA-256 of the
   * interaction uid, as base64url.
   * @satisfies {ServerRoute<{ Params: { uid: string } }>}
   */
  ({
    method: 'GET',
    path: '/test/otp/{uid}',
    options: {
      auth: TEST_OTP_SECRET,
      validate: {
        params: Joi.object({
          uid: Joi.string().required()
        })
      }
    },
    handler(request) {
      return findTestOtp(request.params.uid)
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
