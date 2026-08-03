import { randomUUID } from 'node:crypto'

import { ACCOUNTS_COLLECTION_NAME, db } from '~/src/mongo.js'

const MONGO_DUPLICATE_KEY = 11000

/**
 * @typedef {object} AccountDocument
 * @property {string} _id - opaque durable account id (feeds the OIDC `sub`)
 * @property {string} email - lowercased verified email (unique index)
 * @property {boolean} emailVerified - proven by OTP at sign-up
 * @property {string} phone - recovery mobile, E.164 (capture-only for now)
 * @property {boolean} phoneVerified - always false until a recovery story verifies it
 * @property {'active'} status - lifecycle state
 * @property {Date} createdAt - when the account was created
 * @property {Date} updatedAt - when the account was last modified
 */

/**
 * The accounts collection (resolved lazily — the `db` live binding is only
 * assigned once `prepareDb` has run)
 */
function coll() {
  return /** @type {Collection<AccountDocument>} */ (
    db.collection(ACCOUNTS_COLLECTION_NAME)
  )
}

/**
 * Case-insensitive account lookup. The opaque `_id` (not the email) becomes
 * the OIDC `sub`, keeping PII out of tokens and logs.
 * @param {string} email
 */
export function findByEmail(email) {
  return coll().findOne({ email: email.toLowerCase() })
}

/**
 * Account lookup by opaque account id
 * @param {string} id
 */
export function findById(id) {
  return coll().findOne({ _id: id })
}

/**
 * Creates an account. On a duplicate email (racing interaction, or a
 * crash-retry after creation but before the OTP was consumed) the unique
 * index rejects the insert and the existing account is returned instead —
 * the caller signs that account in.
 * @param {{ email: string, phone: string }} input
 */
export async function createAccount({ email, phone }) {
  const now = new Date()
  /** @type {AccountDocument} */
  const account = {
    _id: randomUUID(),
    email: email.toLowerCase(),
    emailVerified: true,
    phone,
    phoneVerified: false,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  try {
    await coll().insertOne(account)
    return account
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      err.code === MONGO_DUPLICATE_KEY
    ) {
      const existing = await findByEmail(email)
      if (existing) {
        return existing
      }
    }
    throw err
  }
}

/**
 * @import { Collection } from 'mongodb'
 */
