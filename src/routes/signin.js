import Joi from 'joi'

import { telephoneSchema } from '~/src/lib/telephone.js'
import { completeSignup } from '~/src/services/signin-service.js'

/**
 * Sign-in domain routes, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP). Code and phone
 * are validated loosely at the boundary — the services are the authority
 * (a UI bug can degrade error messages, never security). The route checks
 * that the phone has the shape of a telephone number. The sign-in service
 * decides if the account can use it, because that depends on the email of
 * the account.
 */
export default /** @type {ServerRoute[]} */ ([
  {
    method: 'POST',
    path: '/accounts',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          phone: telephoneSchema.required()
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
 */
