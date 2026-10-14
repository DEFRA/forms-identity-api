import { createHash, timingSafeEqual } from 'node:crypto'

import Boom from '@hapi/boom'
import Joi from 'joi'

import { config } from '~/src/config/index.js'
import { PURPOSE } from '~/src/constants.js'
import { findTestOtp } from '~/src/services/test-otp-service.js'

const PLUGIN_NAME = 'test-otp'
const STRATEGY_NAME = 'test-otp-secret'

/**
 * @param {string} value
 */
function digest(value) {
  return createHash('sha256').update(value).digest()
}

/**
 * Whether two strings are equal. Both values are hashed first. The digests
 * have the same length, which timingSafeEqual needs, and the time the
 * comparison takes tells a caller nothing about either value.
 * @param {string} a
 * @param {string} b
 */
function secureEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b))
}

/**
 * Lets an automated test read a sign-in code. A test is a different caller
 * from forms-identity-ui, which is the only caller the server default
 * accepts, so the plugin has its own strategy and holds the routes that use
 * it. The strategy checks a shared secret; the test and this service hold
 * the same value.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const testOtp = {
  plugin: {
    name: PLUGIN_NAME,
    register(server) {
      const expected = `Bearer ${config.get('otp.testRead.secret')}`

      server.auth.scheme(STRATEGY_NAME, () => ({
        /**
         * @param {Request} request
         * @param {ResponseToolkit} h
         */
        authenticate(request, h) {
          const sent = request.headers.authorization

          if (typeof sent !== 'string' || !secureEqual(sent, expected)) {
            throw Boom.unauthorized(null, 'Bearer')
          }

          return h.authenticated({ credentials: {} })
        }
      }))

      server.auth.strategy(STRATEGY_NAME, STRATEGY_NAME)

      server.route(
        /** @type {ServerRoute[]} */ ([
          /**
           * The newest code for a test address, in plain text. The test knows
           * the address it uses, so it reads the code by address.
           * @satisfies {ServerRoute<{ Params: { email: string, purpose: PurposeType } }>}
           */
          ({
            method: 'GET',
            path: '/test/otp/{email}/{purpose}',
            options: {
              auth: STRATEGY_NAME,
              validate: {
                params: Joi.object({
                  email: Joi.string().required(),
                  purpose: Joi.string()
                    .valid(...Object.keys(PURPOSE))
                    .required()
                })
              }
            },
            handler(request) {
              const { email, purpose } = request.params
              return findTestOtp(email, purpose)
            }
          })
        ])
      )
    }
  }
}

/**
 * @import { Request, ResponseToolkit, ServerRegisterPluginObject, ServerRoute } from '@hapi/hapi'
 * @import { PurposeType } from '~/src/constants.js'
 */
