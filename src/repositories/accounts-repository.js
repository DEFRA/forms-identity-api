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
 * Whether an error is Mongo's duplicate-key rejection — exposed so callers
 * can react to uniqueness conflicts without knowing Mongo error codes
 * @param {unknown} err
 */
export function isDuplicateKeyError(err) {
  return (
    err instanceof Error && 'code' in err && err.code === MONGO_DUPLICATE_KEY
  )
}

/**
 * @import { Collection } from 'mongodb'
 */
