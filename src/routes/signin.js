import Joi from 'joi'

import { joi as telephoneJoi } from '~/src/lib/telephone.js'
import { completeSignup } from '~/src/services/signin-service.js'

/**
 * Sign-in domain routes, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP). Code and phone
 * are validated loosely at the boundary — the OTP service is the authority
 * (a UI bug can degrade error messages, never security).
 */
export default /** @type {ServerRoute[]} */ ([
  {
    method: 'POST',
    path: '/accounts',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          phone: /** @type {TelephoneSchema} */ (telephoneJoi.string())
            .phoneNumber()
            .required()
        })
      }
    },
    handler(request) {
      const { uid, phone } = /** @type {{ uid: string, phone: string }} */ (
        request.payload
      )
      return completeSignup(uid, phone)
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { TelephoneSchema } from '~/src/lib/telephone.js'
 */
