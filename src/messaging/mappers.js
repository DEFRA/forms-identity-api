import { randomUUID } from 'node:crypto'

import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType
} from '@defra/forms-model'

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
 * @param {string} email
 * @param {string} uid
 * @returns {IdentitySignInUnsuccessfulMessage}
 */
export function unsuccessfulSignInEventMapper(email, uid) {
  const newId = randomUUID()
  /** @type {IdentitySignInUnsuccessfulMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_SIGN_IN_UNSUCCESSFUL,
    entityId: newId,
    createdAt: new Date(),
    createdBy: {
      id: newId,
      displayName: email
    },
    data: {
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
 * @param {string} target
 * @param {string} uid
 * @returns {IdentityTooManyOtpsRequestedMessage}
 */
export function tooManyOtpsRequestedEventMapper(target, uid) {
  const newId = randomUUID()
  /** @type {IdentityTooManyOtpsRequestedMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
    entityId: newId,
    createdAt: new Date(),
    createdBy: {
      id: newId,
      displayName: target
    },
    data: {
      target,
      uid
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} uid
 * @param {string} [accountId]
 * @returns {IdentityIncorrectCodeEnteredMessage}
 */
export function incorrectCodeEnteredEventMapper(uid, accountId) {
  const newId = randomUUID()
  /** @type {IdentityIncorrectCodeEnteredMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
    entityId: accountId ?? newId,
    createdAt: new Date(),
    createdBy: {
      id: accountId ?? newId,
      displayName: uid
    },
    data: {
      uid,
      accountId
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @param {string} uid
 * @param {string} [accountId]
 * @returns {IdentityIncorrectCodeLockoutMessage}
 */
export function incorrectCodeLockoutEventMapper(uid, accountId) {
  const newId = randomUUID()
  /** @type {IdentityIncorrectCodeLockoutMessage} */
  return {
    schemaVersion: AuditEventMessageSchemaVersion.V1,
    category: AuditEventMessageCategory.AUTHENTICATION,
    source: AuditEventMessageSource.FORMS_IDENTITY,
    type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_LOCKOUT,
    entityId: accountId ?? newId,
    createdAt: new Date(),
    createdBy: {
      id: accountId ?? newId,
      displayName: uid
    },
    data: {
      uid,
      accountId
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
 * @param {string} oldPhone
 * @param {string} newPhone
 * @returns {IdentityPhoneNumberUpdatedMessage}
 */
export function phoneNumberUpdatedEventMapper(accountId, oldPhone, newPhone) {
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
      changed: {
        old: oldPhone,
        new: newPhone
      }
    },
    messageCreatedAt: new Date()
  }
}

/**
 * @import { IdentitySignInSuccessfulMessage, IdentitySignInUnsuccessfulMessage, IdentitySignOutMessage, IdentityRegistrationMessage, IdentityTooManyOtpsRequestedMessage, IdentityIncorrectCodeEnteredMessage, IdentityIncorrectCodeLockoutMessage, IdentityAccountDeletionMessage, IdentityEmailAddressUpdatedMessage, IdentityPhoneNumberUpdatedMessage } from '@defra/forms-model'
 */
