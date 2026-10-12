import Joi from 'joi'

import { TEST_OTP_SECRET } from '~/src/auth/test-otp-secret.js'
import { PURPOSE } from '~/src/constants.js'
import { findTestOtp } from '~/src/services/test-otp-service.js'

/**
 * Routes for automated tests. A test is a different caller from
 * forms-identity-ui, which is the only caller the server default accepts.
 */
export default /** @type {ServerRoute[]} */ (
  /** @type {unknown[]} */ ([
    /**
     * The newest code for a test address, in plain text. The test knows the
     * address it uses, so it reads the code by address.
     * @type {ServerRoute<{ Params: { email: string, purpose: PurposeType } }>}
     */
    ({
      method: 'GET',
      path: '/test/otp/{email}/{purpose}',
      options: {
        auth: TEST_OTP_SECRET,
        validate: {
          params: Joi.object({
            email: Joi.string().required(),
            purpose: Joi.string()
              .valid(...Object.keys(PURPOSE))
              .required()
          })
        }
      },
      handler(request) {
        const { email, purpose } = request.params
        return findTestOtp(email, purpose)
      }
    })
  ])
)

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { PurposeType } from '~/src/constants.js'
 */
