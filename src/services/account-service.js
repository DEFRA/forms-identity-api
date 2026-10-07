import { PURPOSE, STATUS } from '~/src/constants.js'
import { auditEmailChanged } from '~/src/lib/audit.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

/**
 * Updates the email address on an account
 * @param {string} uid
 * @param {string} id
 */
export async function updateEmail(uid, id) {
  // Check we have the verified 'email' OTP record for the correct account
  const filterEmailOtp = {
    uid,
    purpose: PURPOSE.ACCOUNT_VERIFY_EMAIL,
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
    purpose: PURPOSE.ACCOUNT_VERIFY_PHONE,
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
    return { status: STATUS.EMAIL_SAME_AS_CURRENT }
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
        return { status: STATUS.EMAIL_ALREADY_IN_USE }
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
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 */
