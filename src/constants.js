/**
 * OTP purposes. A purpose names the authority a code grants, as
 * JOURNEY_CHALLENGE — never the journey alone or the challenge alone (see the
 * spec's purpose naming rule). Codes are isolated per {uid, purpose}, so a
 * new challenge is a new entry here, not a reuse of an existing one.
 */
export const PURPOSE = {
  SIGNIN_VERIFY_EMAIL: 'SIGNIN_VERIFY_EMAIL'
}
