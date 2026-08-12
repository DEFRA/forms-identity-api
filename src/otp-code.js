import crypto from 'node:crypto'

import Joi from 'joi'

/** OTP code length. Generation and validation both read this value. */
const CODE_LENGTH = 6

/** Upper bound (exclusive) for a random CODE_LENGTH-digit code */
const CODE_MAX_EXCLUSIVE = 10 ** CODE_LENGTH

/** A well-formed code: exactly CODE_LENGTH digits, leading zeros significant */
export const codeSchema = Joi.string()
  .length(CODE_LENGTH)
  .pattern(/^\d+$/)
  .required()

/**
 * Returns a random code of CODE_LENGTH digits. Short values are zero-padded, so
 * 1 becomes "000001". The zeros are part of the code: the stored code and the
 * code the user types must match.
 * @returns {string}
 */
export function generateCode() {
  return String(crypto.randomInt(0, CODE_MAX_EXCLUSIVE)).padStart(
    CODE_LENGTH,
    '0'
  )
}
