import Boom from '@hapi/boom'

import { PURPOSE, STATUS } from '~/src/constants.js'
import { auditAfterCommit } from '~/src/lib/audit-after-commit.js'
import {
  auditAccountDeleted,
  auditEmailChanged,
  auditPhoneChanged,
  auditSignOut
} from '~/src/lib/audit.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import { rollback, runInTransaction } from '~/src/lib/transaction.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'
import { clearRequestCount } from '~/src/services/otp-service.js'
import { isTestAddress } from '~/src/services/test-otp-service.js'

/**
 * Spends a verified OTP record as part of the running transaction. If a
 * concurrent request has already spent it, the whole transaction is rolled
 * back, so a code can never authorise two changes.
 * @param {Filter<OtpDocument>} filter
 * @param {ClientSession} session
 */
async function consumeOtp(filter, session) {
  const consumed = await otpsRepository.update(
    filter,
    { consumed: true },
    session
  )

  if (!consumed) {
    rollback({ status: STATUS.INVALID })
  }
}

/**
 * Updates the email address on an account. The account change, the spent OTP
 * records and the cleared request counts commit together, so none of them
 * is left behind if another fails.
 * @param {string} uid
 * @param {string} id
 */
export async function updateEmail(uid, id) {
  // Set inside the transaction, and read afterwards to tell a duplicate that
  // rolled it back apart from other failures
  const attempted = { newEmail: /** @type {string | undefined} */ (undefined) }

  let outcome
  try {
    outcome = await runInTransaction(async (session) => {
      // Check we have the verified 'email' OTP record for the correct account
      const filterEmailOtp = {
        uid,
        purpose: PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
        verified: true,
        consumed: false,
        accountId: id
      }
      const otpEmail = await otpsRepository.findOne(filterEmailOtp, session)

      if (!otpEmail) {
        return { status: STATUS.INVALID }
      }

      // Check we have the verified 'phone' OTP record for the correct account
      // This is belt-and-braces as the UI enforces this too, but better to be safe here
      const filterPhoneOtp = {
        uid,
        purpose: PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE,
        verified: true,
        consumed: false,
        accountId: id
      }
      const otpPhone = await otpsRepository.findOne(filterPhoneOtp, session)
      if (!otpPhone) {
        return { status: STATUS.INVALID }
      }

      const newEmail = otpEmail.target.toLowerCase()
      attempted.newEmail = newEmail

      // Check the account exists
      const account = await accountsRepository.findById(id, session)

      if (!account) {
        return { status: STATUS.INVALID }
      }

      const oldEmail = account.email

      if (oldEmail === newEmail) {
        return { status: STATUS.SAME_AS_CURRENT }
      }

      /** @type {Partial<AccountDocument>} */
      const accountUpdate = {
        email: newEmail,
        updatedAt: new Date()
      }

      await accountsRepository.update(id, accountUpdate, session)
      await consumeOtp(filterEmailOtp, session)
      await consumeOtp(filterPhoneOtp, session)
      // Clear any previous OTP requests from the same email/phone
      await clearRequestCount(otpPhone.target, session)
      await clearRequestCount(newEmail, session)

      return {
        status: STATUS.VALID,
        accountId: account._id,
        oldEmail,
        newEmail
      }
    })
  } catch (err) {
    // A duplicate rolls the transaction back, so look for the account that
    // holds the address only now it has finished
    if (attempted.newEmail && accountsRepository.isDuplicateKeyError(err)) {
      const existing = await accountsRepository.findByEmail(attempted.newEmail)
      if (existing) {
        return { status: STATUS.ALREADY_IN_USE }
      }
    }
    throw err
  }

  if (outcome.status !== STATUS.VALID) {
    return outcome
  }

  const { accountId, oldEmail, newEmail } = outcome
  await auditAfterCommit(() => auditEmailChanged(accountId, oldEmail, newEmail))

  return { status: STATUS.VALID }
}

/**
 * Updates the phone number on an account. The account change, the spent OTP
 * record and the cleared request count commit together.
 * @param {string} uid
 * @param {string} id
 * @param {string} phone
 */
export async function updatePhone(uid, id, phone) {
  const outcome = await runInTransaction(async (session) => {
    // Check we have the verified 'email' OTP record for the correct account
    const filterEmailOtp = {
      uid,
      purpose: PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL,
      verified: true,
      consumed: false,
      accountId: id
    }
    const otpEmail = await otpsRepository.findOne(filterEmailOtp, session)

    if (!otpEmail) {
      return { status: STATUS.INVALID }
    }

    // Check the account exists
    const account = await accountsRepository.findById(id, session)

    if (!account) {
      return { status: STATUS.INVALID }
    }

    // The route checked that this has the shape of a telephone number. This
    // step decides if the account can use it. The rule depends on the email
    // of the stored account, so that a caller cannot claim to be a test account.
    let newPhone
    try {
      newPhone = normaliseMobile(phone, isTestAddress(account.email))
    } catch {
      return { status: STATUS.INVALID_PHONE }
    }

    const oldPhone = account.phone

    if (oldPhone === newPhone) {
      return { status: STATUS.SAME_AS_CURRENT }
    }

    /** @type {Partial<AccountDocument>} */
    const accountUpdate = {
      phone: newPhone,
      updatedAt: new Date()
    }

    await accountsRepository.update(id, accountUpdate, session)
    await consumeOtp(filterEmailOtp, session)
    // Clear any previous OTP requests from the same email
    await clearRequestCount(otpEmail.target, session)

    return {
      status: STATUS.VALID,
      accountId: account._id,
      email: account.email,
      oldPhone,
      newPhone
    }
  })

  if (outcome.status !== STATUS.VALID) {
    return outcome
  }

  await auditAfterCommit(() =>
    auditPhoneChanged(
      outcome.accountId,
      outcome.email,
      outcome.oldPhone,
      outcome.newPhone
    )
  )

  return { status: STATUS.VALID }
}

/**
 * Deletes an account by marking it as 'deleted' in the database.
 * The uid denotes the OTP record, and the account id on the OTP record must match the account id passed in.
 * The account is not actually removed from the database, but is instead marked as deleted
 * so that it can be recovered if necessary. The deletion, the spent OTP record
 * and the cleared request count commit together.
 * @param {string} uid
 * @param {string} id
 * @throws {Boom.Boom} Throws a Boom error if the account is not found.
 * @throws {Boom.Boom} Throws a Boom error if the account id does not match the OTP record.
 * @throws {Boom.Boom} Throws a Boom error if the account could not be deleted.
 */
export async function deleteAccount(uid, id) {
  const outcome = await runInTransaction(async (session) => {
    // Check we have the verified 'email' OTP record for the correct account
    const filterEmailOtp = {
      uid,
      purpose: PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL,
      verified: true,
      consumed: false,
      accountId: id
    }
    const otpEmail = await otpsRepository.findOne(filterEmailOtp, session)

    if (!otpEmail) {
      return { status: STATUS.INVALID }
    }

    /** @type {Partial<AccountDocument>} */
    const accountUpdate = {
      status: 'deleted',
      updatedAt: new Date()
    }

    const { matchedCount: matched, modifiedCount: modified } =
      await accountsRepository.update(id, accountUpdate, session)

    if (matched === 0) {
      throw Boom.notFound(`Account ${id} not found`)
    }

    if (modified === 0) {
      throw Boom.badRequest(`Account ${id} could not be deleted`)
    }

    await consumeOtp(filterEmailOtp, session)
    // Clear any previous OTP requests from the same email
    await clearRequestCount(otpEmail.target, session)

    return { status: STATUS.VALID, email: otpEmail.target }
  })

  if (outcome.status !== STATUS.VALID) {
    return outcome
  }

  const { email } = outcome
  await auditAfterCommit(() => auditAccountDeleted(id, email))
  await auditAfterCommit(() => auditSignOut(id, email))

  return { status: STATUS.VALID }
}

/**
 * Records that an account's session has ended (sign-out).
 * @param {string} id - the account `_id`, which is also the OIDC `sub`
 * @throws {Boom.Boom} Throws a Boom error if the account is not found.
 */
export async function recordSignOut(id) {
  const account = await accountsRepository.findById(id)

  if (!account) {
    throw Boom.notFound(`Account ${id} not found`)
  }

  await auditSignOut(account._id, account.email)
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 * @import { OtpDocument } from '~/src/repositories/otps-repository.js'
 * @import { ClientSession, Filter } from 'mongodb'
 */
