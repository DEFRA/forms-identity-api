// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'

/**
 * Audit event names. Each name is the event as it appears in the audit
 * record, so downstream consumers can filter on it.
 */
export const AUDIT_EVENT = {
  OTP_ISSUED: 'OtpIssued',
  OTP_LOCKED_OUT: 'OtpLockedOut',
  SIGN_IN: 'SignIn',
  REGISTRATION: 'Registration'
}

/**
 * Writes one audit record. Every event goes through here rather than the
 * CDP audit logger directly, so the email is always present and every record
 * has the same shape. The library stamps the time and the platform adds the
 * service name and version, so we don't have to log those explicitly.
 *
 * Use this directly only for events that happen before an account exists.
 * Anything that acts on an account goes through auditAccountEvent.
 * @param {string} event
 * @param {string} email
 * @param {Record<string, string>} [fields]
 */
function auditEvent(event, email, fields = {}) {
  audit({ event, email, ...fields })
}

/**
 * Writes one audit record for an event that acts on an account.
 * @param {string} event
 * @param {string} accountId - the account `_id`, which is also the OIDC `sub`
 * @param {string} email
 * @param {Record<string, string>} [fields]
 */
function auditAccountEvent(event, accountId, email, fields = {}) {
  auditEvent(event, email, { accountId, ...fields })
}

/**
 * A one-time code was issued and sent to an email address. Recorded per
 * request, so a resend is its own event — the trail shows how many codes
 * went to an address and for which interaction.
 * @param {string} uid - the interaction the code belongs to
 * @param {string} email - the address the code was sent to
 */
export function auditOtpIssued(uid, email) {
  auditEvent(AUDIT_EVENT.OTP_ISSUED, email, { uid })
}

/**
 * An email address asked for more codes than the limit allows and is now
 * locked out. Recorded once, when the lockout starts: the requests refused
 * while it holds leave no OtpIssued record, so the trail reads as the
 * lockout followed by silence.
 * @param {string} uid - the interaction the limit was reached on
 * @param {string} email - the address that is locked out
 * @param {Date} lockedUntil - when the address may request a code again
 */
export function auditOtpLockout(uid, email, lockedUntil) {
  auditEvent(AUDIT_EVENT.OTP_LOCKED_OUT, email, {
    uid,
    lockedUntil: lockedUntil.toISOString()
  })
}

/**
 * A user authenticated and is signed in
 * @param {string} accountId - the account `_id`, which is also the OIDC `sub`
 * @param {string} email
 * @param {string} uid - the interaction signed in on, tying the sign-in back
 * to the OtpIssued record for the code that granted it
 */
export function auditSignIn(accountId, email, uid) {
  auditAccountEvent(AUDIT_EVENT.SIGN_IN, accountId, email, { uid })
}

/**
 * A new account was created
 * @param {string} accountId
 * @param {string} email
 * @param {string} phone - E.164
 */
export function auditRegistration(accountId, email, phone) {
  auditAccountEvent(AUDIT_EVENT.REGISTRATION, accountId, email, { phone })
}
