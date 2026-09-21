import Boom from '@hapi/boom'

import { PURPOSE, STATUS } from '~/src/constants.js'
import { auditRegistration, auditSignIn } from '~/src/lib/audit.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

/**
 * Updates the phone number on an account
 * @param {string} uid
 * @param {string} id
 * @param {string} phone
 */
export async function updatePhone(uid, id, phone) {
  // normalised to E.164; the route already checked it is a telephone number,
  // so a throw here means it is a valid number but not a mobile
  let phoneNumber
  try {
    phoneNumber = normaliseMobile(phone)
  } catch {
    return { status: STATUS.INVALID_PHONE }
  }

  const account = await accountsRepository.findById(id)

  if (!account) {
    throw Boom.notFound()
  }

  /** @type {AccountDocument} */
  const accountUpdate = {
    ...account,
    phone: phoneNumber,
    updatedAt: new Date()
  }
  await accountsRepository.update(id, accountUpdate)

  const filter = {
    uid,
    purpose: PURPOSE.ACCOUNT_VERIFY_PHONE,
    verified: true,
    verifiedAdditional: true,
    consumed: false
  }
  const consumed = await otpsRepository.update(filter, { consumed: true })

  if (!consumed) {
    return { status: STATUS.INVALID } // a concurrent submit already completed
  }

  auditRegistration(account._id, account.email, account.phone)
  auditSignIn(account._id, account.email)

  return { status: STATUS.SIGNED_IN, accountId: account._id }
}

/**
 * Updates the phone number on an account
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

  // auditRegistration(account._id, account.email, account.phone)
  // auditSignIn(account._id, account.email)

  return { status: STATUS.SIGNED_IN, accountId: account._id }
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 */
