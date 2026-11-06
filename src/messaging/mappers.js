import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType
} from '@defra/forms-model'

import { TRANSPORT } from '~/src/constants.js'
import { getTransportType } from '~/src/routes/otp-helper.js'

/**
 *
 * @param {PurposeType} purpose
 * @param { string | undefined } target -either email or phone, depending on purpose
 * @returns {{ email: string } | { phone: string } | {}}
 */
function determineTarget(purpose, target) {
  if (!target) return {}
  if (getTransportType(purpose) === TRANSPORT.EMAIL) {
    return { email: target }
  }
  if (getTransportType(purpose) === TRANSPORT.SMS) {
    return { phone: target }
  }
  return {}
}

/**
 * @param {string} accountId
 * @param {string} email
 * @param {string} uid
 * @returns {IdentitySignInSuccessfulMessage}
 */
export function successfulSignInEventMapper(accountId, email, uid) {
  /** @type {IdentitySignInSuccessfulMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL,
    entityId: accountId,
    createdAt: new Date(),
    createdBy: {
      id: accountId,
      displayName: email
    },
    data: {
      accountId,
      email,
      uid
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} accountId
 * @param {string} email
 * @returns {IdentitySignOutMessage}
 */
export function signOutEventMapper(accountId, email) {
  /** @type {IdentitySignOutMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_SIGN_OUT,
    entityId: accountId,
    createdAt: new Date(),
    createdBy: {
      id: accountId,
      displayName: email
    },
    data: {
      accountId,
      email
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} accountId
 * @param {string} email
 * @param {string} phone
 * @returns {IdentityRegistrationMessage}
 */
export function registrationEventMapper(accountId, email, phone) {
  /** @type {IdentityRegistrationMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_REGISTRATION,
    entityId: accountId,
    createdAt: new Date(),
    createdBy: {
      id: accountId,
      displayName: email
    },
    data: {
      accountId,
      email,
      phone
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {PurposeType} purpose
 * @param {string} target
 * @param {string} uid
 * @returns {IdentityTooManyOtpsRequestedMessage}
 */
export function tooManyOtpsRequestedEventMapper(purpose, target, uid) {
  const targetObj = determineTarget(purpose, target)
  /** @type {IdentityTooManyOtpsRequestedMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
    entityId: uid,
    createdAt: new Date(),
    createdBy: {
      id: uid,
      displayName: target
    },
    data: {
      ...targetObj,
      uid
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} uid
 * @param {PurposeType} purpose
 * @param {string} [accountId]
 * @param {string} [target]
 * @returns {IdentityIncorrectCodeEnteredMessage}
 */
export function incorrectCodeEnteredEventMapper(
  uid,
  purpose,
  accountId,
  target
) {
  const targetObj = determineTarget(purpose, target)
  /** @type {IdentityIncorrectCodeEnteredMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
    entityId: accountId ?? uid,
    createdAt: new Date(),
    createdBy: {
      id: accountId ?? uid,
      displayName: target ?? uid
    },
    data: {
      accountId,
      ...targetObj,
      uid
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} uid
 * @param {PurposeType} purpose
 * @param {string} [accountId]
 * @param {string} [target]
 * @returns {IdentityIncorrectCodeLockoutMessage}
 */
export function incorrectCodeLockoutEventMapper(
  uid,
  purpose,
  accountId,
  target
) {
  const targetObj = determineTarget(purpose, target)
  /** @type {IdentityIncorrectCodeLockoutMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_LOCKOUT,
    entityId: accountId ?? uid,
    createdAt: new Date(),
    createdBy: {
      id: accountId ?? uid,
      displayName: target ?? uid
    },
    data: {
      uid,
      accountId,
      ...targetObj
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} accountId
 * @param {string} email
 * @returns {IdentityAccountDeletionMessage}
 */
export function accountDeletionEventMapper(accountId, email) {
  /** @type {IdentityAccountDeletionMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_ACCOUNT_DELETION,
    entityId: accountId,
    createdAt: new Date(),
    createdBy: {
      id: accountId,
      displayName: email
    },
    data: {
      accountId,
      email
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} accountId
 * @param {string} oldEmail
 * @param {string} newEmail
 * @returns {IdentityEmailAddressUpdatedMessage}
 */
export function emailAddressUpdatedEventMapper(accountId, oldEmail, newEmail) {
  /** @type {IdentityEmailAddressUpdatedMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_EMAIL_ADDRESS_UPDATED,
    entityId: accountId,
    createdAt: new Date(),
    createdBy: {
      id: accountId,
      displayName: oldEmail
    },
    data: {
      accountId,
      changed: {
        old: oldEmail,
        new: newEmail
      }
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} accountId
 * @param {string} email
 * @param {string} oldPhone
 * @param {string} newPhone
 * @returns {IdentityPhoneNumberUpdatedMessage}
 */
export function phoneNumberUpdatedEventMapper(
  accountId,
  email,
  oldPhone,
  newPhone
) {
  /** @type {IdentityPhoneNumberUpdatedMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED,
    entityId: accountId,
    createdAt: new Date(),
    createdBy: {
      id: accountId,
      displayName: oldPhone
    },
    data: {
      accountId,
      email,
      changed: {
        old: oldPhone,
        new: newPhone
      }
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @import { IdentitySignInSuccessfulMessage, IdentitySignOutMessage, IdentityRegistrationMessage, IdentityTooManyOtpsRequestedMessage, IdentityIncorrectCodeEnteredMessage, IdentityIncorrectCodeLockoutMessage, IdentityAccountDeletionMessage, IdentityEmailAddressUpdatedMessage, IdentityPhoneNumberUpdatedMessage } from '@defra/forms-model'
 * @import { PurposeType } from '~/src/constants.js'
 */
