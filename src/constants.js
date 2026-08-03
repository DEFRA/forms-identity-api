/**
 * OTP purposes. A purpose names the authority a code grants, as
 * JOURNEY_CHALLENGE — never the journey alone or the challenge alone (see the
 * spec's purpose naming rule). Codes are isolated per {uid, purpose}, so a
 * new challenge is a new entry here, not a reuse of an existing one.
 */
export const PURPOSE = {
  SIGNIN_VERIFY_EMAIL: 'SIGNIN_VERIFY_EMAIL'
}

/**
 * Sign-in service result statuses, returned to the route handlers.
 * @type {{ INVALID: 'invalid', PHONE_REQUIRED: 'phone-required', SIGNED_IN: 'signed-in', INVALID_PHONE: 'invalid-phone' }}
 */
export const STATUS = {
  INVALID: 'invalid',
  PHONE_REQUIRED: 'phone-required',
  SIGNED_IN: 'signed-in',
  INVALID_PHONE: 'invalid-phone'
}
