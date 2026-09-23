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
  // Check we have the verified OTP record for the correct account
  const filterOtp = {
    uid,
    purpose: PURPOSE.ACCOUNT_VERIFY_EMAIL,
    verified: true,
    consumed: false,
    accountId: id
  }
  const doc = await otpsRepository.findOne(filterOtp)

  if (!doc) {
    return { status: STATUS.INVALID }
  }

  const newEmail = doc.target.toLowerCase()

  // Check the account exists
  const account = await accountsRepository.findById(id)

  if (!account) {
    return { status: STATUS.INVALID }
  }

  /** @type {AccountDocument} */
  const accountUpdate = {
    ...account,
    email: newEmail,
    updatedAt: new Date()
  }
  await accountsRepository.update(id, accountUpdate)

  const consumed = await otpsRepository.update(filterOtp, { consumed: true })

  if (!consumed) {
    return { status: STATUS.INVALID } // a concurrent submit already completed
  }

  auditEmailChanged(account._id, newEmail)

  return { status: STATUS.VALID }
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 */
