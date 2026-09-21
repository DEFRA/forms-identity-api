import crypto from 'node:crypto'

import Boom from '@hapi/boom'

import { PURPOSE, STATUS } from '~/src/constants.js'
import { auditRegistration, auditSignIn } from '~/src/lib/audit.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

// Every OTP operation filters on {uid, purpose} — never uid alone — so codes
// are isolated per interaction and per purpose.

/**
 * Completes JIT signup: only legal against a verified, unconsumed record
 * for this uid. Account creation precedes consumption so a crash between
 * the two self-heals (the retry finds the account and signs it in).
 * @param {string} uid
 * @param {string} phone
 * @returns {Promise<CompleteResult>}
 */
export async function completeSignup(uid, phone) {
  const filter = {
    uid,
    purpose: PURPOSE.SIGNIN_VERIFY_EMAIL,
    verified: true,
    consumed: false
  }
  const doc = await otpsRepository.findOne(filter)

  if (!doc) {
    return { status: STATUS.INVALID }
  }

  // normalised to E.164; the route already checked it is a telephone number,
  // so a throw here means it is a valid number but not a mobile
  let phoneNumber
  try {
    phoneNumber = normaliseMobile(phone)
  } catch {
    return { status: STATUS.INVALID_PHONE }
  }

  const account = await createAccount(doc.target, phoneNumber)

  const consumed = await otpsRepository.update(filter, { consumed: true })

  if (!consumed) {
    return { status: STATUS.INVALID } // a concurrent submit already completed
  }

  auditRegistration(account._id, account.email, account.phone)
  auditSignIn(account._id, account.email)

  return { status: STATUS.SIGNED_IN, accountId: account._id }
}

/**
 * Creates an account. On a duplicate email (racing interaction, or a
 * crash-retry after creation but before the OTP was consumed) the unique
 * index rejects the insert and the existing account is returned instead —
 * the caller signs that account in.
 * @param {string} email
 * @param {string} phone - E.164
 */
export async function createAccount(email, phone) {
  const now = new Date()
  /** @type {AccountDocument} */
  const account = {
    _id: crypto.randomUUID(),
    email: email.toLowerCase(),
    phone,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  try {
    return await accountsRepository.insert(account)
  } catch (err) {
    if (accountsRepository.isDuplicateKeyError(err)) {
      const existing = await accountsRepository.findByEmail(email.toLowerCase())
      if (existing) {
        return existing
      }
    }
    throw err
  }
}

/**
 * Account lookup backing the provider's userinfo/claims
 * @param {string} id
 * @throws {Boom.Boom} notFound when no account exists for the id
 */
export async function findAccountById(id) {
  const account = await accountsRepository.findById(id)

  if (!account) {
    throw Boom.notFound('Account not found')
  }

  return account
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 * @typedef {{ status: 'invalid' } | { status: 'invalid-code-format' } | { status: 'invalid-code-consumed-or-expired' } | { status: 'phone-required' } | { status: 'signed-in', accountId: string }} VerifyResult
 * @typedef {{ status: 'invalid' } | { status: 'invalid-phone' } | { status: 'signed-in', accountId: string }} CompleteResult
 */
