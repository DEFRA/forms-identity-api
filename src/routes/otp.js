import Boom from '@hapi/boom'
import Joi from 'joi'

import { EN_GB, PURPOSE, TRANSPORT } from '~/src/constants.js'
import { getTransportType } from '~/src/routes/otp-helper.js'
import { findOtp, requestOtp, verifyOtp } from '~/src/services/otp-service.js'

const transportSchema = Joi.string()
  .valid(...Object.keys(TRANSPORT))
  .default(TRANSPORT.EMAIL)
const purposeSchema = Joi.string()
  .valid(...Object.keys(PURPOSE))
  .default(PURPOSE.SIGNIN_VERIFY_EMAIL)

export const SERVICE_NAME_MAX_LENGTH = 150

// Anything that looks like a URL, script scheme or domain (e.g. "evil.com").
// Notify escapes HTML in personalisation but auto-links URLs/domains, so these
// are a phishing risk and are stripped out.
// Applied to single words, so every alternative is fixed-length (no backtracking):
//   "//"                 any scheme://, or protocol-relative //host
//   "<scheme>:"          javascript:, mailto: etc. without slashes
//   "www."
//   "x.ab"               domain-like, e.g. evil.com, gov.uk
const SERVICE_NAME_URL_LIKE =
  /\/\/|\b(?:javascript|vbscript|data|mailto|tel|sms|https?|ftp):|www\.|[\p{L}\p{N}-]\.[a-z]{2}/iu

const serviceNameSchema = Joi.string()
  .trim()
  .allow('')
  .custom(sanitiseServiceName)

/**
 * Truncates the service name to the max length, then removes any
 * whitespace-separated word that looks like a URL or domain.
 * Truncation happens first so it can't turn a safe word into a domain-like one.
 * @param {string} value - the service name
 */
export function sanitiseServiceName(value) {
  return value
    .slice(0, SERVICE_NAME_MAX_LENGTH)
    .split(/\s+/)
    .filter((word) => !SERVICE_NAME_URL_LIKE.test(word))
    .join(' ')
    .trim()
}

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
            otherwise: Joi.string().required()
          }),
          target: Joi.when('transport', {
            is: TRANSPORT.EMAIL,
            then: Joi.string().email().required(),
            otherwise: Joi.forbidden()
          }),
          serviceName: serviceNameSchema.optional(),
          language: Joi.string().optional()
        })
      }
    },
    handler(request) {
      const {
        uid,
        transport,
        purpose,
        accountId,
        target,
        serviceName,
        language = EN_GB
      } = /** @type {{ uid: string, transport: TransportType, purpose: PurposeType, accountId?: string, target: string, serviceName?: string, language: string }} */ (
        request.payload
      )
      // Further guards (in addition to Joi schema)
      if (
        getTransportType(purpose) === TRANSPORT.EMAIL &&
        transport !== TRANSPORT.EMAIL
      ) {
        throw Boom.badRequest()
      }
      if (
        getTransportType(purpose) === TRANSPORT.SMS &&
        transport !== TRANSPORT.SMS
      ) {
        throw Boom.badRequest()
      }
      return requestOtp(uid, target, transport, purpose, {
        serviceName,
        language,
        accountId
      })
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
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { PurposeType, TransportType } from '~/src/constants.js'
 */
