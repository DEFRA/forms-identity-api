import Boom from '@hapi/boom'

import { PURPOSE, STATUS } from '~/src/constants.js'
import { auditEmailChanged } from '~/src/lib/audit.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

/**
 * Updates the email address on an account
 * @param {string} uid
 * @param {string} id
 * @param {string} email
 */
export async function updateEmail(uid, id, email) {
  const account = await accountsRepository.findById(id)

  if (!account) {
    throw Boom.notFound()
  }

  /** @type {AccountDocument} */
  const accountUpdate = {
    ...account,
    email,
    updatedAt: new Date()
  }
  await accountsRepository.update(id, accountUpdate)

  const filter = {
    uid,
    purpose: PURPOSE.ACCOUNT_VERIFY_EMAIL,
    verified: true,
    consumed: false
  }
  const consumed = await otpsRepository.update(filter, { consumed: true })

  if (!consumed) {
    return { status: STATUS.INVALID } // a concurrent submit already completed
  }

  auditEmailChanged(account._id, account.email, email)

  return { status: STATUS.VALID }
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 */
