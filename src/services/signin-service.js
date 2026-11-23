import crypto from 'node:crypto'

import { setUserId } from '@defra/forms-common'
import Boom from '@hapi/boom'

import { PURPOSE, STATUS } from '~/src/constants.js'
import { auditRegistration, auditSignIn } from '~/src/lib/audit.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import { runInTransaction } from '~/src/lib/transaction.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'
import { clearRequestCount } from '~/src/services/otp-service.js'
import { isTestAddress } from '~/src/services/test-otp-service.js'

/**
 * Completes JIT signup: only legal against a verified, unconsumed record
 * for this uid. Account creation, OTP consumption and lockout clearing
 * commit together, and a failed audit publish rolls the database writes back.
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

  const attempt = () =>
    runInTransaction(async (session) => {
      const doc = await otpsRepository.findOne(filter, session)

      if (!doc) {
        return { status: STATUS.INVALID }
      }

      // The route checked that this has the shape of a telephone number. This
      // step decides if the account can use it. The rule depends on the email
      // of the account, which only the stored record gives, so that a caller
      // cannot claim to be a test account.
      let phoneNumber
      try {
        phoneNumber = normaliseMobile(phone, isTestAddress(doc.target))
      } catch {
        return { status: STATUS.INVALID_PHONE }
      }

      const existing = await accountsRepository.findByEmail(
        doc.target.toLowerCase(),
        session
      )
      const consumed = await otpsRepository.update(
        filter,
        { consumed: true },
        session
      )

      if (!consumed) {
        return { status: STATUS.INVALID } // a concurrent submit already completed
      }

      const account =
        existing ??
        (await accountsRepository.insert(
          buildAccount(doc.target, phoneNumber),
          session
        ))

      await clearRequestCount(doc.target, session)

      if (!existing) {
        await auditRegistration(account._id, account.email, account.phone)
      }
      await auditSignIn(account._id, account.email, uid)

      return { status: STATUS.SIGNED_IN, account, created: !existing }
    })

  let result
  try {
    result = await attempt()
  } catch (err) {
    if (!accountsRepository.isDuplicateKeyError(err)) {
      throw err
    }

    // A racing signup inserted the same email after this transaction
    // started, and the duplicate rejected it and rolled it back. Run it again
    // in a fresh transaction, which now finds that account and signs it in.
    result = await attempt()
  }

  if (result.status !== STATUS.SIGNED_IN) {
    return result
  }

  setUserId(result.account._id)

  return { status: STATUS.SIGNED_IN, accountId: result.account._id }
}

/**
 * @param {string} email
 * @param {string} phone
 * @returns {AccountDocument}
 */
export function buildAccount(email, phone) {
  const now = new Date()

  return {
    _id: crypto.randomUUID(),
    email: email.toLowerCase(),
    phone,
    status: 'active',
    createdAt: now,
    updatedAt: now
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
 * @typedef {{ status: 'otp-issued' } | { status: 'locked-out', lockedUntil: string }} RequestResult
 * @typedef {{ status: 'invalid' } | { status: 'invalid-code-format' } | { status: 'invalid-code-consumed-or-expired' } | { status: 'phone-required' } | { status: 'signed-in', accountId: string }} VerifyResult
 * @typedef {{ status: 'invalid' } | { status: 'invalid-phone' } | { status: 'signed-in', accountId: string }} CompleteResult
 */
