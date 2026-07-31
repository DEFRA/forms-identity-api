import { randomUUID } from 'node:crypto'

import { ACCOUNTS_COLLECTION_NAME } from '~/src/mongo.js'

const MONGO_DUPLICATE_KEY = 11000

/**
 * @typedef {object} AccountDocument
 * @property {string} _id - opaque durable account id (feeds the OIDC `sub`)
 * @property {string} email - lowercased verified email (unique index)
 * @property {boolean} emailVerified
 * @property {string} phone - recovery mobile, E.164 (capture-only for now)
 * @property {boolean} phoneVerified
 * @property {'active'} status
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {object} AccountsService
 * @property {(email: string) => Promise<AccountDocument | null>} findByEmail
 * @property {(id: string) => Promise<AccountDocument | null>} findById
 * @property {(input: { email: string, phone: string }) => Promise<AccountDocument>} createAccount
 */

/**
 * Accounts domain service. The opaque `_id` (not the email) becomes the OIDC
 * `sub`, keeping PII out of tokens and logs.
 * @param {Db} db
 * @returns {AccountsService}
 */
export function makeAccountsService(db) {
  const coll = /** @type {Collection<AccountDocument>} */ (
    db.collection(ACCOUNTS_COLLECTION_NAME)
  )

  /** @param {string} email */
  function findByEmail(email) {
    return coll.findOne({ email: email.toLowerCase() })
  }

  /** @param {string} id */
  function findById(id) {
    return coll.findOne({ _id: id })
  }

  /**
   * Creates an account. On a duplicate email (racing interaction, or a
   * crash-retry after creation but before the OTP was consumed) the unique
   * index rejects the insert and the existing account is returned instead —
   * the caller signs that account in.
   * @param {{ email: string, phone: string }} input
   */
  async function createAccount({ email, phone }) {
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
      await coll.insertOne(account)
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

  return { findByEmail, findById, createAccount }
}

/**
 * @import { Collection, Db } from 'mongodb'
 */
