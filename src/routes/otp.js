import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { PURPOSE, TRANSPORT } from '~/src/constants.js'
import {
  findOtp,
  removeOtps,
  requestOtp,
  verifyOtp
} from '~/src/services/otp-service.js'

const transportSchema = Joi.string()
  .valid(...Object.keys(TRANSPORT))
  .default(TRANSPORT.EMAIL)
const purposeSchema = Joi.string()
  .valid(...Object.keys(PURPOSE))
  .default(PURPOSE.SIGNIN_VERIFY_EMAIL)

/**
 * Domain routes for OTP operations, consumed only by forms-identity-ui over the
 * internal network (this whole service is private in CDP).
 */
export default /** @type {ServerRoute[]} */ ([
  {
    method: 'POST',
    path: '/otp/request',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          transport: transportSchema,
          purpose: purposeSchema,
          // Account id should only be allowed for ACCOUNT_ purposes
          accountId: Joi.when('purpose', {
            is: PURPOSE.SIGNIN_VERIFY_EMAIL,
            then: Joi.forbidden(),
            otherwise: Joi.string().allow('')
          }),
          target: Joi.when('transport', {
            is: TRANSPORT.EMAIL,
            then: Joi.string().email().required(),
            otherwise: Joi.forbidden()
          })
        })
      }
    },
    async handler(request, h) {
      const { uid, transport, purpose, accountId, target } =
        /** @type {{ uid: string, transport: TransportType, purpose: PurposeType, accountId?: string, target: string }} */ (
          request.payload
        )
      // Further guards (in addition to Joi schema)
      if (
        purpose === PURPOSE.SIGNIN_VERIFY_EMAIL &&
        transport !== TRANSPORT.EMAIL
      ) {
        throw Boom.badRequest()
      }
      if (
        purpose === PURPOSE.ACCOUNT_VERIFY_EMAIL &&
        transport !== TRANSPORT.EMAIL
      ) {
        throw Boom.badRequest()
      }
      if (
        purpose === PURPOSE.ACCOUNT_VERIFY_PHONE &&
        transport !== TRANSPORT.SMS
      ) {
        throw Boom.badRequest()
      }
      await requestOtp(uid, target, transport, purpose, accountId)
      return h.response().code(StatusCodes.NO_CONTENT)
    }
  },
  {
    method: 'POST',
    path: '/otp/verify',
    options: {
      validate: {
        payload: Joi.object({
          uid: Joi.string().required(),
          code: Joi.string().allow('').required(),
          id: Joi.when('purpose', {
            is: PURPOSE.SIGNIN_VERIFY_EMAIL,
            then: Joi.forbidden(),
            otherwise: Joi.string().required()
          }),
          purpose: purposeSchema
        })
      }
    },
    handler(request) {
      const { uid, code, id, purpose } =
        /** @type {{ uid: string, code: string, purpose: PurposeType, id?: string }} */ (
          request.payload
        )
      return verifyOtp(uid, code, purpose, id)
    }
  },
  {
    method: 'GET',
    path: '/otp/{uid}/{purpose?}',
    options: {
      validate: {
        params: Joi.object({
          uid: Joi.string().required(),
          purpose: purposeSchema
        })
      }
    },
    handler(request) {
      const { uid, purpose } =
        /** @type {{ uid: string, purpose: PurposeType }} */ (request.params)
      return findOtp(uid, purpose)
    }
  },
  {
    method: 'DELETE',
    path: '/otp/{uid}',
    options: {
      validate: {
        params: Joi.object({
          uid: Joi.string().required()
        })
      }
    },
    async handler(request, h) {
      const uid = /** @type {string} */ (request.params.uid)
      await removeOtps(uid)
      return h.response().code(StatusCodes.NO_CONTENT)
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { TelephoneSchema } from '~/src/lib/telephone.js'
 * @import { PurposeType, TransportType } from '~/src/constants.js'
 */
