// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'

/**
 * Audit event names. Each name is the event as it appears in the audit
 * record, so downstream consumers can filter on it.
 */
export const AUDIT_EVENT = {
  SIGN_IN: 'SignIn',
  REGISTRATION: 'Registration'
}

/**
 * Writes one audit record. Every event goes through here rather than the
 * CDP audit logger directly, so the account id and email are always present
 * and every record has the same shape. The library stamps the time and the
 * platform adds the service name and version.
 * @param {string} event
 * @param {string} accountId
 * @param {string} email
 * @param {Record<string, string>} [fields]
 */
function auditEvent(event, accountId, email, fields = {}) {
  audit({ event, accountId, email, ...fields })
}

/**
 * A user authenticated and is signed in
 * @param {string} accountId - the account `_id`, which is also the OIDC `sub`
 * @param {string} email
 */
export function auditSignIn(accountId, email) {
  auditEvent(AUDIT_EVENT.SIGN_IN, accountId, email)
}

/**
 * A new account was created
 * @param {string} accountId
 * @param {string} email
 * @param {string} phone - E.164
 */
export function auditRegistration(accountId, email, phone) {
  auditEvent(AUDIT_EVENT.REGISTRATION, accountId, email, { phone })
}
