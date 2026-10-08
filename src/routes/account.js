import Joi from 'joi'

import { updateEmail, updatePhone } from '~/src/services/account-service.js'
import { findAccountById } from '~/src/services/signin-service.js'

/**
 * Domain routes for account edit operations, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP).
 */
export default /** @type {ServerRoute[]} */ (
  /** @type {unknown[]} */ ([
    /** @type {ServerRoute<{ Params: { id: string } }>} */
    ({
      method: 'GET',
      path: '/accounts/{id}',
      options: {
        validate: {
          params: Joi.object({ id: Joi.string().required() })
        }
      },
      async handler(request) {
        const { id } = request.params
        const account = await findAccountById(id)

        return { id: account._id, email: account.email, phone: account.phone }
      }
    }),
    /** @type {ServerRoute<{ Params: { uid: string, id: string } }>} */
    ({
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
      async handler(request) {
        const { uid, id } = request.params
        // New email is derived from OTP that has been verified
        const res = await updateEmail(uid, id)
        return res
      }
    }),
    /** @type {ServerRoute<{ Payload: { phone: string }, Params: { uid: string, id: string } }>} */
    ({
      method: 'PATCH',
      path: '/accounts/{uid}/{id}/phone',
      options: {
        validate: {
          params: Joi.object({
            uid: Joi.string().required(),
            id: Joi.string().required()
          }),
          payload: Joi.object({
            phone: Joi.string().required()
          })
        }
      },
      async handler(request) {
        const { uid, id } = request.params
        const { phone } = request.payload
        const res = await updatePhone(uid, id, phone)
        return res
      }
    })
  ])
)

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
