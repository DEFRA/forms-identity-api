/**
 * OTP purposes. A purpose names the full authority a code grants in
 * JOURNEY_CHALLENGE form, so it captures both the journey and the challenge
 * together (see the spec's purpose naming rule). Codes are isolated per
 * {uid, purpose}, so each new challenge gets its own entry.
 */
export const PURPOSE = {
  SIGNIN_VERIFY_EMAIL: 'SIGNIN_VERIFY_EMAIL'
}

/**
 * Sign-in service result statuses, returned to the route handlers.
 * @type {{ INVALID: 'invalid', INVALID_CODE_FORMAT: 'invalid-code-format', INVALID_CODE_CONSUMED_OR_EXPIRED: 'invalid-code-consumed-or-expired', PHONE_REQUIRED: 'phone-required', SIGNED_IN: 'signed-in', INVALID_PHONE: 'invalid-phone' }}
 */
export const STATUS = {
  INVALID: 'invalid',
  INVALID_CODE_FORMAT: 'invalid-code-format',
  INVALID_CODE_CONSUMED_OR_EXPIRED: 'invalid-code-consumed-or-expired',
  PHONE_REQUIRED: 'phone-required',
  SIGNED_IN: 'signed-in',
  INVALID_PHONE: 'invalid-phone'
}
