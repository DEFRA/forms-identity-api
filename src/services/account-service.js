import Boom from '@hapi/boom'

import { PURPOSE, STATUS } from '~/src/constants.js'
import {
  auditAccountDeleted,
  auditEmailChanged,
  auditPhoneChanged
} from '~/src/lib/audit.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'
import { isTestAddress } from '~/src/services/test-otp-service.js'

/**
 * Updates the email address on an account
 * @param {string} uid
 * @param {string} id
 */
export async function updateEmail(uid, id) {
  // Check we have the verified 'email' OTP record for the correct account
  const filterEmailOtp = {
    uid,
    purpose: PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
    verified: true,
    consumed: false,
    accountId: id
  }
  const otpEmail = await otpsRepository.findOne(filterEmailOtp)

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
  const otpPhone = await otpsRepository.findOne(filterPhoneOtp)
  if (!otpPhone) {
    return { status: STATUS.INVALID }
  }

  const newEmail = otpEmail.target.toLowerCase()

  // Check the account exists
  const account = await accountsRepository.findById(id)

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

  try {
    await accountsRepository.update(id, accountUpdate)
  } catch (err) {
    if (accountsRepository.isDuplicateKeyError(err)) {
      const existing = await accountsRepository.findByEmail(newEmail)
      if (existing) {
        return { status: STATUS.ALREADY_IN_USE }
      }
    }
    throw err
  }

  // Consume the OTP records, but ignore if the 'consume' fails since
  // they'll expire within 15 mins anyway, and the account record has already been changed
  await otpsRepository.update(filterEmailOtp, {
    consumed: true
  })
  await otpsRepository.update(filterPhoneOtp, {
    consumed: true
  })

  auditEmailChanged(account._id, oldEmail, newEmail)

  return { status: STATUS.VALID }
}

/**
 * Updates the phone number on an account
 * @param {string} uid
 * @param {string} id
 * @param {string} phone
 */
export async function updatePhone(uid, id, phone) {
  // Check we have the verified 'email' OTP record for the correct account
  const filterEmailOtp = {
    uid,
    purpose: PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL,
    verified: true,
    consumed: false,
    accountId: id
  }
  const otpEmail = await otpsRepository.findOne(filterEmailOtp)

  if (!otpEmail) {
    return { status: STATUS.INVALID }
  }

  // Check the account exists
  const account = await accountsRepository.findById(id)

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

  await accountsRepository.update(id, accountUpdate)

  // Consume the OTP record, but ignore if the 'consume' fails since
  // it will expire within 15 mins anyway, and the account record has already been changed
  await otpsRepository.update(filterEmailOtp, {
    consumed: true
  })

  auditPhoneChanged(account._id, account.email, oldPhone, newPhone)

  return { status: STATUS.VALID }
}

/**
 * Deletes an account by marking it as 'deleted' in the database.
 * The uid denotes the OTP record, and the account id on the OTP record must match the account id passed in.
 * The account is not actually removed from the database, but is instead marked as deleted
 * so that it can be recovered if necessary.
 * @param {string} uid
 * @param {string} id
 * @throws {Boom.Boom} Throws a Boom error if the account is not found.
 * @throws {Boom.Boom} Throws a Boom error if the account id does not match the OTP record.
 * @throws {Boom.Boom} Throws a Boom error if the account could not be deleted.
 */
export async function deleteAccount(uid, id) {
  // Check we have the verified 'email' OTP record for the correct account
  const filterEmailOtp = {
    uid,
    purpose: PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL,
    verified: true,
    consumed: false,
    accountId: id
  }
  const otpEmail = await otpsRepository.findOne(filterEmailOtp)

  if (!otpEmail) {
    return { status: STATUS.INVALID }
  }

  /** @type {Partial<AccountDocument>} */
  const accountUpdate = {
    status: 'deleted',
    updatedAt: new Date()
  }

  const { matchedCount: matched, modifiedCount: modified } =
    await accountsRepository.update(id, accountUpdate)

  if (matched === 0) {
    throw Boom.notFound(`Account ${id} not found`)
  }

  if (modified === 0) {
    throw Boom.badRequest(`Account ${id} could not be deleted`)
  }

  // Consume the OTP record, but ignore if the 'consume' fails since
  // it will expire within 15 mins anyway, and the account record has already been changed
  await otpsRepository.update(filterEmailOtp, {
    consumed: true
  })

  auditAccountDeleted(id, otpEmail.target)

  return { status: STATUS.VALID }
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 */
