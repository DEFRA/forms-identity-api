import Boom from '@hapi/boom'

import { TEST_EMAIL_DOMAIN } from '~/src/constants.js'
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
 * Keeps a code in plain text for a test to read. The record is in its own
 * collection, so that the otps collection holds hashes only.
 * @param {string} target - lowercased test email
 * @param {PurposeType} purpose
 * @param {string} code
 * @param {Date} expireAt - the same expiry as the code
 */
export function keepTestOtp(target, purpose, code, expireAt) {
  return testOtpsRepository.upsert({ target, purpose }, { code, expireAt })
}

/**
 * The newest code that was kept for a test address and a purpose.
 *
 * Mongo TTL is lazy, so the expiry is also checked here.
 * @param {string} email
 * @param {PurposeType} purpose
 * @throws {Boom.Boom} notFound when there is no code that is still in date
 */
export async function findTestOtp(email, purpose) {
  const doc = await testOtpsRepository.findOne({
    target: email.toLowerCase(),
    purpose
  })

  if (!doc || doc.expireAt.getTime() < Date.now()) {
    throw Boom.notFound('No test code for this address')
  }

  return { code: doc.code }
}

/**
 * @import { PurposeType } from '~/src/constants.js'
 */
