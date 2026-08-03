import Joi from 'joi'

import { joi as telephoneJoi } from '~/src/lib/telephone.js'
import {
  completeSignup,
  findAccountById,
  findSigninEmail,
  requestOtp,
  verifyOtp
} from '~/src/services/signin-service.js'

/**
 * Sign-in domain routes, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP). Code and phone
 * are validated loosely at the boundary — the OTP service is the authority
 * (a UI bug can degrade error messages, never security).
 */
export default /** @type {ServerRoute[]} */ ([
  {
    method: 'POST',
    path: '/otp/request',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          email: Joi.string().email().required()
        })
      }
    },
    async handler(request, h) {
      const { uid, email } = /** @type {{ uid: string, email: string }} */ (
        request.payload
      )
      await requestOtp(uid, email)
      return h.response().code(204)
    }
  },
  {
    method: 'POST',
    path: '/otp/verify',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          code: Joi.string()
            .pattern(/^\d{6}$/)
            .required()
        })
      }
    },
    handler(request) {
      const { uid, code } = /** @type {{ uid: string, code: string }} */ (
        request.payload
      )
      return verifyOtp(uid, code)
    }
  },
  {
    method: 'POST',
    path: '/accounts',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          phone:
            /** @type {import('~/src/lib/telephone.js').TelephoneSchema} */ (
              telephoneJoi.string()
            )
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
  },
  {
    method: 'GET',
    path: '/otp/{uid}',
    options: {
      validate: {
        params: Joi.object({ uid: Joi.string().required() })
      }
    },
    async handler(request) {
      const uid = /** @type {string} */ (request.params.uid)
      const email = await findSigninEmail(uid)

      return { email }
    }
  },
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

      return { id: account._id, email: account.email }
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
