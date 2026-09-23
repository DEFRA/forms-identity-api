import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { updateEmail } from '~/src/services/account-service.js'
import { findAccountById } from '~/src/services/signin-service.js'

/**
 * Domain routes for account edit operations, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP).
 */
export default /** @type {ServerRoute[]} */ ([
  {
    method: 'GET',
    path: '/accounts/{id}',
    options: {
      validate: {
        params: Joi.object({ id: Joi.string().required() })
      }
    },
    async handler(request) {
      const id = /** @type {string} */ (request.params.id)
      const account = await findAccountById(id)

      return { id: account._id, email: account.email, phone: account.phone }
    }
  },
  {
    method: 'PATCH',
    path: '/accounts/{uid}/{id}/email',
    options: {
      validate: {
        params: Joi.object({
          uid: Joi.string().required(),
          id: Joi.string().required()
        })
      }
    },
    async handler(request, h) {
      const { uid, id } = /** @type {{ uid: string, id: string }} */ (
        request.params
      )
      // New email is derived from OTP that has been verified
      await updateEmail(uid, id)
      return h.response().code(StatusCodes.OK)
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
