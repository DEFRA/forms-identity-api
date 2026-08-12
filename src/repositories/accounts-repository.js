import { ACCOUNTS_COLLECTION_NAME, db } from '~/src/mongo.js'

export { isDuplicateKeyError } from '~/src/mongo.js'

/**
 * @typedef {object} AccountDocument
 * @property {string} _id - opaque durable account id (feeds the OIDC `sub`)
 * @property {string} email - lowercased email, verified by OTP at sign-up (unique index)
 * @property {string} phone - recovery mobile, E.164 (capture-only for now)
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
 * @param {string} email - already normalised (lowercased) by the service
 */
export function findByEmail(email) {
  return coll().findOne({ email })
}

/**
 * @param {string} id
 */
export function findById(id) {
  return coll().findOne({ _id: id })
}

/**
 * Inserts an account document; a duplicate email rejects on the unique
 * index (see {@link isDuplicateKeyError})
 * @param {AccountDocument} account
 */
export async function insert(account) {
  await coll().insertOne(account)
  return account
}

/**
 * @import { Collection } from 'mongodb'
 */
