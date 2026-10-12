import LibPhoneNumber from 'google-libphonenumber'
import JoiBase from 'joi'

import { isTestNumber } from '~/src/lib/phone.js'

/*
 * Joi extension for telephone numbers, defaulting to the UK region when no
 * country code is given. It checks the shape of the input only. The sign-in
 * service decides if an account can use the number.
 */

const phoneUtil = LibPhoneNumber.PhoneNumberUtil.getInstance()

/**
 * The extended string schema (JS port of the original's typed Root)
 * @typedef {JoiBase.StringSchema & { phoneNumber: () => TelephoneSchema, testPhoneNumber: () => TelephoneSchema }} TelephoneSchema
 */

export const COUNTRY = 'GB'
export const INVALID_ERROR_CODE = 'phoneNumber.invalid'
export const INVALID_MESSAGE = '{{#label}} must be a telephone number'

export const joi = /** @type {JoiBase.Root} */ (
  JoiBase.extend({
    type: 'string',
    base: JoiBase.string(),
    messages: {
      [INVALID_ERROR_CODE]: INVALID_MESSAGE
    },
    rules: {
      phoneNumber: {
        /**
         * @this {JoiBase.ExtensionBoundSchema}
         */
        method() {
          return this.$_addRule({ name: 'phoneNumber' })
        },
        /**
         * @param {string} value
         * @param {JoiBase.CustomHelpers} helpers
         */
        validate(value, { error }) {
          try {
            const parsed = phoneUtil.parse(value, COUNTRY)

            if (!phoneUtil.isValidNumber(parsed)) {
              return error(INVALID_ERROR_CODE)
            }

            return value
          } catch {
            return error(INVALID_ERROR_CODE)
          }
        }
      },
      testPhoneNumber: {
        /**
         * @this {JoiBase.ExtensionBoundSchema}
         */
        method() {
          return this.$_addRule({ name: 'testPhoneNumber' })
        },
        /**
         * @param {string} value
         * @param {JoiBase.CustomHelpers} helpers
         */
        validate(value, { error }) {
          try {
            if (!isTestNumber(phoneUtil.parse(value, COUNTRY))) {
              return error(INVALID_ERROR_CODE)
            }

            return value
          } catch {
            return error(INVALID_ERROR_CODE)
          }
        }
      }
    }
  })
)

const telephoneString = () => /** @type {TelephoneSchema} */ (joi.string())

/**
 * A valid telephone number, or a number in the Ofcom fictional mobile range
 * (the library reports those as not valid)
 */
export const telephoneSchema = JoiBase.alternatives()
  .try(telephoneString().phoneNumber(), telephoneString().testPhoneNumber())
  .messages({ 'alternatives.match': INVALID_MESSAGE })
