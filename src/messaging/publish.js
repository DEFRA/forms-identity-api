import { messageSchema } from '@defra/forms-model'
import Joi from 'joi'

import {
  accountDeletionEventMapper,
  emailAddressUpdatedEventMapper,
  incorrectCodeEnteredEventMapper,
  incorrectCodeLockoutEventMapper,
  phoneNumberUpdatedEventMapper,
  registrationEventMapper,
  signOutEventMapper,
  successfulSignInEventMapper,
  tooManyOtpsRequestedEventMapper,
  unsuccessfulSignInEventMapper
} from '~/src/messaging/mappers.js'
import { publishEvent } from '~/src/messaging/publish-base.js'

/**
 * Helper to validate and publish an event
 * @param {AuditMessage} auditMessage
 */
async function validateAndPublishEvent(auditMessage) {
  const value = Joi.attempt(auditMessage, messageSchema, {
    abortEarly: false
  })

  return publishEvent(value)
}

/**
 * Publish successful sign-in event
 * @param {string} accountId
 * @param {string} email
 * @param {string} uid
 */
export async function publishSuccessfulSignInEvent(accountId, email, uid) {
  const auditMessage = successfulSignInEventMapper(accountId, email, uid)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish unsuccessful sign-in event
 * @param {string} email
 * @param {string} uid
 */
export async function publishUnsuccessfulSignInEvent(email, uid) {
  // TODO - where does this get called from?
  const auditMessage = unsuccessfulSignInEventMapper(email, uid)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish sign-out event
 * @param {string} accountId
 * @param {string} email
 */
export async function publishSignOutEvent(accountId, email) {
  const auditMessage = signOutEventMapper(accountId, email)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish new registration event
 * @param {string} accountId
 * @param {string} email
 * @param {string} phone
 */
export async function publishRegistrationEvent(accountId, email, phone) {
  const auditMessage = registrationEventMapper(accountId, email, phone)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish too many OTPs requested event
 * @param {string} target
 * @param {string} uid
 */
export async function publishTooManyOtpsRequestedEvent(target, uid) {
  const auditMessage = tooManyOtpsRequestedEventMapper(target, uid)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish incorrect code entered event
 * @param {string} uid
 * @param {string} [accountId]
 */
export async function publishIncorrectCodeEnteredEvent(uid, accountId) {
  const auditMessage = incorrectCodeEnteredEventMapper(uid, accountId)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish incorrect code lockout event
 * @param {string} uid
 * @param {string} [accountId]
 */
export async function publishIncorrectCodeLockoutEvent(uid, accountId) {
  const auditMessage = incorrectCodeLockoutEventMapper(uid, accountId)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish account deletion event
 * @param {string} accountId
 * @param {string} email
 */
export async function publishAccountDeletionEvent(accountId, email) {
  const auditMessage = accountDeletionEventMapper(accountId, email)

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish email address updated event
 * @param {string} accountId
 * @param {string} oldEmail
 * @param {string} newEmail
 */
export async function publishEmailAddressUpdatedEvent(
  accountId,
  oldEmail,
  newEmail
) {
  const auditMessage = emailAddressUpdatedEventMapper(
    accountId,
    oldEmail,
    newEmail
  )

  return validateAndPublishEvent(auditMessage)
}

/**
 * Publish phone number updated event
 * @param {string} accountId
 * @param {string} oldPhone
 * @param {string} newPhone
 */
export async function publishPhoneNumberUpdatedEvent(
  accountId,
  oldPhone,
  newPhone
) {
  const auditMessage = phoneNumberUpdatedEventMapper(
    accountId,
    oldPhone,
    newPhone
  )

  return validateAndPublishEvent(auditMessage)
}

/**
 * @import { AuditMessage } from '@defra/forms-model'
 */
