import { PURPOSE, TRANSPORT } from '~/src/constants.js'

/** @type {Set<PurposeType>} */
const transportMustBeEmail = new Set([
  PURPOSE.SIGNIN_VERIFY_EMAIL,
  PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
  PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL,
  PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL
])

/** @type {Set<PurposeType>} */
const transportMustBeSms = new Set([PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE])

/**
 * @param {PurposeType} purpose
 * @returns {TransportType | undefined}
 */
export function getTransportType(purpose) {
  if (transportMustBeEmail.has(purpose)) {
    return TRANSPORT.EMAIL
  }
  if (transportMustBeSms.has(purpose)) {
    return TRANSPORT.SMS
  }
  return undefined
}

/**
 * @import { PurposeType, TransportType } from '~/src/constants.js'
 */
