import Joi from 'joi'

import { TEST_OTP_SECRET } from '~/src/auth/test-otp-secret.js'
import { findTestOtp } from '~/src/services/test-otp-service.js'

/**
 * Routes for automated tests.
 *
 * Each route names the test secret strategy. The server default accepts
 * forms-identity-ui only, and a test is a different caller.
 */
export default /** @type {ServerRoute[]} */ ([
  /**
   * The newest sign-in code for a test address, in plain text. The test
   * knows the address it signs in with, so it reads the code by address.
   */
  {
    method: 'GET',
    path: '/test/otp/{email}',
    options: {
      auth: TEST_OTP_SECRET,
      validate: {
        params: Joi.object({
          email: Joi.string().required()
        })
      }
    },
    handler(request) {
      const { email } = /** @type {{ email: string }} */ (request.params)
      return findTestOtp(email)
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
