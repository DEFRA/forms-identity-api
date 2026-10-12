import Boom from '@hapi/boom'

import { PURPOSE, TEST_EMAIL_DOMAIN } from '~/src/constants.js'
import * as testOtpsRepository from '~/src/repositories/test-otps-repository.js'

/**
 * Whether an email address is on the test email domain. The address must
 * end with `@` and the full domain, so that an address on a domain that
 * only contains the test domain is a normal address.
 * @param {string} email
 */
export function isTestAddress(email) {
  return email.toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`)
}

/**
 * Whether this code is kept for a test to read. That is so only for a
 * sign-in code to a test address. A sign-in code always goes by email.
 * @param {PurposeType} purpose
 * @param {string} target - the address the code is for
 */
export function isKeptForTest(purpose, target) {
  return purpose === PURPOSE.SIGNIN_VERIFY_EMAIL && isTestAddress(target)
}

/**
 * Keeps a sign-in code in plain text for a test to read. The record is in
 * its own collection, so that the otps collection holds hashes only.
 * @param {string} target - lowercased test email
 * @param {string} code
 * @param {Date} expireAt - the same expiry as the code
 */
export function keepTestOtp(target, code, expireAt) {
  return testOtpsRepository.upsert(target, { code, expireAt })
}

/**
 * The newest sign-in code that was kept for a test address.
 *
 * Mongo TTL is lazy, so the expiry is also checked here.
 * @param {string} email
 * @throws {Boom.Boom} notFound when there is no code that is still in date
 */
export async function findTestOtp(email) {
  const doc = await testOtpsRepository.findOne({ target: email.toLowerCase() })

  if (!doc || doc.expireAt.getTime() < Date.now()) {
    throw Boom.notFound('No test code for this address')
  }

  return { code: doc.code }
}

/**
 * @import { PurposeType } from '~/src/constants.js'
 */
