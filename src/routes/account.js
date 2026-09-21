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
        }),
        payload: Joi.object({
          email: Joi.string().email().required()
        })
      }
    },
    handler(request) {
      const { uid, id } = /** @type {{ uid: string, id: string }} */ (
        request.params
      )
      const { email } = /** @type {{ email: string }} */ (request.payload)
      return updateEmail(uid, id, email)
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
