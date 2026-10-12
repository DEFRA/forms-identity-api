import Joi from 'joi'

import { TEST_OTP_SECRET } from '~/src/auth/test-otp-secret.js'
import { purposeSchema } from '~/src/routes/otp.js'
import { findTestOtp } from '~/src/services/test-otp-service.js'

/**
 * Routes for automated tests.
 *
 * Each route names the test secret strategy. The server default accepts
 * forms-identity-ui only, and a test is a different caller.
 * @type {ServerRoute[]}
 */
export default [
  /**
   * The newest code for a test address, in plain text. The test knows the
   * address it uses, so it reads the code by address. The purpose selects
   * the code, and a read with no purpose gives the sign-in code.
   */
  {
    method: 'GET',
    path: '/test/otp/{email}/{purpose?}',
    options: {
      auth: TEST_OTP_SECRET,
      validate: {
        params: Joi.object({
          email: Joi.string().required(),
          purpose: purposeSchema
        })
      }
    },
    /** @param {ReadTestOtpRequest} request */
    handler(request) {
      const { email, purpose } = request.params
      return findTestOtp(email, purpose)
    }
  }
]

/**
 * @import { Request, ServerRoute } from '@hapi/hapi'
 * @import { PurposeType } from '~/src/constants.js'
 * @typedef {Request<{ Params: { email: string, purpose: PurposeType } }>} ReadTestOtpRequest
 */
