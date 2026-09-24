/**
 * OTP purposes. A purpose names the full authority a code grants in
 * JOURNEY_CHALLENGE form, so it captures both the journey and the challenge
 * together (see the spec's purpose naming rule). Codes are isolated per
 * {uid, purpose}, so each new challenge gets its own entry.
 * @type {{ SIGNIN_VERIFY_EMAIL: 'SIGNIN_VERIFY_EMAIL', ACCOUNT_VERIFY_PHONE: 'ACCOUNT_VERIFY_PHONE', ACCOUNT_VERIFY_EMAIL: 'ACCOUNT_VERIFY_EMAIL' }}
 */
export const PURPOSE = {
  SIGNIN_VERIFY_EMAIL: 'SIGNIN_VERIFY_EMAIL',
  ACCOUNT_VERIFY_PHONE: 'ACCOUNT_VERIFY_PHONE',
  ACCOUNT_VERIFY_EMAIL: 'ACCOUNT_VERIFY_EMAIL'
}

/**
 * @typedef {typeof PURPOSE[keyof typeof PURPOSE]} PurposeType
 */

/**
 * OTP requests can be sent over any of these transport types.
 * @type {{ EMAIL: 'EMAIL', SMS: 'SMS' }}
 */
export const TRANSPORT = {
  EMAIL: 'EMAIL',
  SMS: 'SMS'
}

/**
 * @typedef {typeof TRANSPORT[keyof typeof TRANSPORT]} TransportType
 */

/**
 * Sign-in service result statuses, returned to the route handlers.
 * @type {{ INVALID: 'invalid', INVALID_CODE_FORMAT: 'invalid-code-format', INVALID_CODE_CONSUMED_OR_EXPIRED: 'invalid-code-consumed-or-expired', PHONE_REQUIRED: 'phone-required', SIGNED_IN: 'signed-in', INVALID_PHONE: 'invalid-phone', VALID: 'valid' }}
 */
export const STATUS = {
  INVALID: 'invalid',
  INVALID_CODE_FORMAT: 'invalid-code-format',
  INVALID_CODE_CONSUMED_OR_EXPIRED: 'invalid-code-consumed-or-expired',
  PHONE_REQUIRED: 'phone-required',
  SIGNED_IN: 'signed-in',
  INVALID_PHONE: 'invalid-phone',
  VALID: 'valid'
}
