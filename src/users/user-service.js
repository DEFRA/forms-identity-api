import { randomUUID } from 'node:crypto'

import { USERS_COLLECTION_NAME, db } from '~/src/mongo.js'

/**
 * @typedef {object} UserDocument
 * @property {string} _id - opaque durable account id (crypto.randomUUID)
 * @property {string} email - the verified email address
 * @property {Date} createdAt - when the account was first created
 * @property {Date} lastSignedInAt - when the account last signed in
 */

/**
 * Upserts a user by email, minting a durable opaque account id on first
 * sign-in. The opaque `_id` (not the email) becomes the OIDC `sub`, keeping
 * PII out of tokens and logs.
 * @param {string} email
 * @returns {Promise<UserDocument>}
 */
export async function upsertUserByEmail(email) {
  const coll = /** @type {Collection<UserDocument>} */ (
    db.collection(USERS_COLLECTION_NAME)
  )

  const user = await coll.findOneAndUpdate(
    { email },
    {
      $setOnInsert: { _id: randomUUID(), email, createdAt: new Date() },
      $set: { lastSignedInAt: new Date() }
    },
    { upsert: true, returnDocument: 'after' }
  )

  if (!user) {
    // No email in the message — keep PII out of logs
    throw new Error('Failed to upsert user')
  }

  return user
}

/**
 * Finds a user by their opaque account id
 * @param {string} id
 * @returns {Promise<UserDocument | null>}
 */
export function findUserById(id) {
  const coll = /** @type {Collection<UserDocument>} */ (
    db.collection(USERS_COLLECTION_NAME)
  )

  return coll.findOne({ _id: id })
}

/**
 * @import { Collection } from 'mongodb'
 */
