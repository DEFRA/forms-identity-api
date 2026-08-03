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
    handler(request) {
      const { uid, email } = /** @type {{ uid: string, email: string }} */ (
        request.payload
      )
      return requestOtp({ uid, email })
    }
  },
  {
    method: 'POST',
    path: '/otp/verify',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          // the route guarantees shape (6 digits); whether the code is
          // CORRECT is the service's business
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
      return verifyOtp({ uid, code })
    }
  },
  {
    method: 'POST',
    path: '/accounts',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          // route guarantees a real telephone number (engine-plugin rule);
          // whether it is a MOBILE is the service's business rule
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
      return completeSignup({ uid, phone })
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

      return { email: await findSigninEmail(uid) }
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

      return {
        id: account._id,
        email: account.email,
        emailVerified: account.emailVerified
      }
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
