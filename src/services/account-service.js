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

  /** @type {Partial<AccountDocument>} */
  const accountUpdate = {
    email: newEmail,
    updatedAt: new Date()
  }
  await accountsRepository.update(id, accountUpdate)

  const consumedEmail = await otpsRepository.update(filterEmailOtp, {
    consumed: true
  })
  const consumedPhone = await otpsRepository.update(filterEmailOtp, {
    consumed: true
  })

  if (!consumedEmail || !consumedPhone) {
    return { status: STATUS.INVALID } // a concurrent submit already completed
  }

  auditEmailChanged(account._id, newEmail)

  return { status: STATUS.VALID }
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 */
