import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'
import { PURPOSE, TEST_EMAIL_DOMAIN, TRANSPORT } from '~/src/constants.js'
import * as testOtpsRepository from '~/src/repositories/test-otps-repository.js'

/**
 * Whether an email address is on the test email domain. The domain is the
 * full text after the last `@`, so that an address on a domain that only
 * contains the test domain is a normal address.
 * @param {string} email
 */
export function isTestAddress(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()

  return domain === TEST_EMAIL_DOMAIN
}

/**
 * Whether this code is kept for a test to read. That is so only for a
 * sign-in code, sent by email, to a test address, while the setting is on.
 *
 * The setting is read on each call rather than once at load, so that it has
 * one source and a test can change it.
 * @param {PurposeType} purpose
 * @param {TransportType} transport
 * @param {string} target - the address the code is for
 */
export function isKeptForTest(purpose, transport, target) {
  return (
    config.get('otp.testRead.enabled') &&
    purpose === PURPOSE.SIGNIN_VERIFY_EMAIL &&
    transport === TRANSPORT.EMAIL &&
    isTestAddress(target)
  )
}

/**
 * Keeps a sign-in code in plain text for a test to read. The record is in
 * its own collection, so that the otps collection holds hashes only.
 * @param {string} uid
 * @param {string} target - lowercased test email
 * @param {string} code
 * @param {Date} expireAt - the same expiry as the code
 */
export function keepTestOtp(uid, target, code, expireAt) {
  return testOtpsRepository.upsert(
    { uid, purpose: PURPOSE.SIGNIN_VERIFY_EMAIL },
    { target, code, expireAt }
  )
}

/**
 * The sign-in code that was kept for an interaction.
 *
 * Mongo TTL is lazy, so the expiry is also checked here.
 * @param {string} uid
 * @throws {Boom.Boom} notFound when there is no code that is still in date
 */
export async function findTestOtp(uid) {
  const doc = await testOtpsRepository.findOne({
    uid,
    purpose: PURPOSE.SIGNIN_VERIFY_EMAIL
  })

  if (!doc || doc.expireAt.getTime() < Date.now()) {
    throw Boom.notFound('No test code for this interaction')
  }

  return { code: doc.code }
}

/**
 * @import { PurposeType, TransportType } from '~/src/constants.js'
 */
