import Boom from '@hapi/boom'
import Joi from 'joi'

/**
 * Sign-in domain routes, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP). Code and phone
 * are validated loosely at the boundary — the OTP service is the authority
 * (a UI bug can degrade error messages, never security).
 * @param {OtpService} otpService
 * @param {AccountsService} accountsService
 * @returns {ServerRoute[]}
 */
export function signinRoutes(otpService, accountsService) {
  return [
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
        return otpService.requestOtp({ uid, email })
      }
    },
    {
      method: 'POST',
      path: '/otp/verify',
      options: {
        validate: {
          payload: Joi.object({
            uid: Joi.string().required(),
            code: Joi.string().allow('').required()
          })
        }
      },
      handler(request) {
        const { uid, code } = /** @type {{ uid: string, code: string }} */ (
          request.payload
        )
        return otpService.verifyOtp({ uid, code })
      }
    },
    {
      method: 'POST',
      path: '/accounts',
      options: {
        validate: {
          payload: Joi.object({
            uid: Joi.string().required(),
            phone: Joi.string().allow('').required()
          })
        }
      },
      handler(request) {
        const { uid, phone } = /** @type {{ uid: string, phone: string }} */ (
          request.payload
        )
        return otpService.completeSignup({ uid, phone })
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
        const account = await accountsService.findById(id)

        if (!account) {
          return Boom.notFound()
        }

        return { id: account._id, email: account.email }
      }
    }
  ]
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { OtpService } from '~/src/signin/otp-service.js'
 * @import { AccountsService } from '~/src/signin/accounts-service.js'
 */
