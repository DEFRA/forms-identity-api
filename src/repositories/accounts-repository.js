import { ACCOUNTS_COLLECTION_NAME, db } from '~/src/mongo.js'

export { isDuplicateKeyError } from '~/src/mongo.js'

/**
 * @typedef {object} AccountDocument
 * @property {string} _id - opaque durable account id (feeds the OIDC `sub`)
 * @property {string} email - lowercased email, verified by OTP at sign-up (unique index)
 * @property {string} phone - recovery mobile, E.164 (capture-only for now)
 * @property {'active' | 'deleted'} status - lifecycle state
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
 * @param {string} email - already normalised (lowercased) by the service
 * @param {ClientSession} [session]
 */
export function findByEmail(email, session) {
  return coll().findOne(
    { email, status: { $ne: 'deleted' } },
    session ? { session } : undefined
  )
}

/**
 * @param {string} id
 * @param {ClientSession} [session]
 */
export function findById(id, session) {
  return coll().findOne(
    { _id: id, status: { $ne: 'deleted' } },
    session ? { session } : undefined
  )
}

/**
 * Inserts an account document; a duplicate email rejects on the unique
 * index (see {@link isDuplicateKeyError})
 * @param {AccountDocument} account
 * @param {ClientSession} [session]
 */
export async function insert(account, session) {
  await coll().insertOne(account, session ? { session } : undefined)
  return account
}

/**
 * Updates an account document; a duplicate email rejects on the unique
 * index (see {@link isDuplicateKeyError})
 * @param {string} id
 * @param {Partial<AccountDocument>} fields
 * @param {ClientSession} [session]
 */
export async function update(id, fields, session) {
  return coll().updateOne(
    { _id: id },
    { $set: fields },
    session ? { session } : undefined
  )
}

/**
 * @import { Collection, ClientSession, UpdateResult } from 'mongodb'
 */
