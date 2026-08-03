import crypto from 'node:crypto'

import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { config } from '~/src/config/index.js'
import { PURPOSE, STATUS } from '~/src/constants.js'
import { sendEmail } from '~/src/lib/notify.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

const OTP_TTL_SECONDS = config.get('otp.ttlSeconds')
const OTP_MAX_ATTEMPTS = config.get('otp.maxAttempts')
const OTP_EXPIRY_MINUTES = Math.round(OTP_TTL_SECONDS / 60)
const OTP_NOTIFY_TEMPLATE_ID = config.get('otp.notify.templateId')

// Every OTP operation filters on {uid, purpose} — never uid alone — so codes
// are isolated per interaction and per purpose.

/**
 * Issues a 6-digit code, stores only its argon2 hash keyed by
 * {uid, purpose} (upsert = resend semantics: one live code per authority
 * per interaction) and delivers the plaintext via Notify
 * @param {string} uid
 * @param {string} email
 */
export async function requestOtp(uid, email) {
  const target = email.toLowerCase()
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const codeHash = await argon2.hash(code)
  const expireAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

  await otpsRepository.upsert(
    { uid, purpose: PURPOSE.SIGNIN_VERIFY_EMAIL },
    {
      target,
      codeHash,
      expireAt,
      attempts: 0,
      verified: false,
      consumed: false
    }
  )

  await sendOtpEmail(target, code)
}

/**
 * Sends a security code by email through Notify. The template must contain:
 *   ((code))           -> the 6-digit one-time code
 *   ((expiry_minutes)) -> derived from otp.ttlSeconds so the email can never
 *                         drift from the configured TTL
 * @param {string} email
 * @param {string} code
 */
function sendOtpEmail(email, code) {
  return sendEmail(OTP_NOTIFY_TEMPLATE_ID, email, {
    code,
    expiry_minutes: OTP_EXPIRY_MINUTES
  })
}

/**
 * Verifies a submitted code against the stored record for this interaction.
 * The email comes from that record rather than the request, so a code can only
 * ever sign in the address it was issued to. The filter requires an unverified
 * record, so each code verifies at most once.
 * @param {string} uid
 * @param {string} code
 * @returns {Promise<VerifyResult>}
 */
export async function verifyOtp(uid, code) {
  /** @type {VerifyResult} */
  const fail = { status: STATUS.INVALID }
  const filter = {
    uid,
    purpose: PURPOSE.SIGNIN_VERIFY_EMAIL,
    verified: false,
    consumed: false
  }
  const doc = await otpsRepository.findOne(filter)

  // Mongo TTL is lazy and isn't evaluated in real time. Double check the
  // expiry in-app in case it hasn't been dropped yet - this is security
  // related, we need to be sure.
  const isExpired = doc ? doc.expireAt.getTime() < Date.now() : false

  if (!doc || isExpired) {
    return fail
  }

  const ok = await argon2.verify(doc.codeHash, code)

  if (!ok) {
    const updated = await otpsRepository.incrementAttempts(filter)
    const attempts = updated?.attempts ?? 0

    if (attempts >= OTP_MAX_ATTEMPTS) {
      await otpsRepository.update(filter, { consumed: true })
    }

    return fail
  }

  const account = await accountsRepository.findByEmail(doc.target)

  // The claim filter pins codeHash so the transition only lands on the
  // exact record version that was verified — a concurrent resend replaces
  // the hash, and a superseded code must not be honoured
  const claim = { ...filter, codeHash: doc.codeHash }

  if (account) {
    const consumed = await otpsRepository.update(claim, { consumed: true })

    if (!consumed) {
      return fail // concurrently spent or superseded by a resend
    }

    return { status: STATUS.SIGNED_IN, accountId: account._id }
  }

  const verified = await otpsRepository.update(claim, { verified: true })

  if (!verified) {
    return fail
  }

  return { status: STATUS.PHONE_REQUIRED }
}

/**
 * Completes JIT signup: only legal against a verified, unconsumed record
 * for this uid. Account creation precedes consumption so a crash between
 * the two self-heals (the retry finds the account and signs it in).
 * @param {string} uid
 * @param {string} phone
 * @returns {Promise<CompleteResult>}
 */
export async function completeSignup(uid, phone) {
  const filter = {
    uid,
    purpose: PURPOSE.SIGNIN_VERIFY_EMAIL,
    verified: true,
    consumed: false
  }
  const doc = await otpsRepository.findOne(filter)

  if (!doc) {
    return { status: STATUS.INVALID }
  }

  // normalised to E.164; the route already checked it is a telephone number,
  // so a throw here means it is a valid number but not a mobile
  let phoneNumber
  try {
    phoneNumber = normaliseMobile(phone)
  } catch {
    return { status: STATUS.INVALID_PHONE }
  }

  const account = await createAccount(doc.target, phoneNumber)

  const consumed = await otpsRepository.update(filter, { consumed: true })

  if (!consumed) {
    return { status: STATUS.INVALID } // a concurrent submit already completed
  }

  return { status: STATUS.SIGNED_IN, accountId: account._id }
}

/**
 * Creates an account. On a duplicate email (racing interaction, or a
 * crash-retry after creation but before the OTP was consumed) the unique
 * index rejects the insert and the existing account is returned instead —
 * the caller signs that account in.
 * @param {string} email
 * @param {string} phone - E.164
 */
export async function createAccount(email, phone) {
  const now = new Date()
  /** @type {AccountDocument} */
  const account = {
    _id: crypto.randomUUID(),
    email: email.toLowerCase(),
    phone,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  try {
    return await accountsRepository.insert(account)
  } catch (err) {
    if (accountsRepository.isDuplicateKeyError(err)) {
      const existing = await accountsRepository.findByEmail(email.toLowerCase())
      if (existing) {
        return existing
      }
    }
    throw err
  }
}

/**
 * The email a sign-in code was sent to — display data for the
 * check-your-email page, read from the stored record (the source of truth
 * verification also uses)
 * @param {string} uid
 * @throws {Boom.Boom} notFound when no code has been requested for the interaction
 */
export async function findSigninEmail(uid) {
  const doc = await otpsRepository.findOne({
    uid,
    purpose: PURPOSE.SIGNIN_VERIFY_EMAIL
  })

  if (!doc) {
    throw Boom.notFound('No sign-in code for this interaction')
  }

  return doc.target
}

/**
 * Account lookup backing the provider's userinfo/claims
 * @param {string} id
 * @throws {Boom.Boom} notFound when no account exists for the id
 */
export async function findAccountById(id) {
  const account = await accountsRepository.findById(id)

  if (!account) {
    throw Boom.notFound('Account not found')
  }

  return account
}

/**
 * @import { AccountDocument } from '~/src/repositories/accounts-repository.js'
 * @typedef {{ status: 'invalid' } | { status: 'phone-required' } | { status: 'signed-in', accountId: string }} VerifyResult
 * @typedef {{ status: 'invalid' } | { status: 'invalid-phone' } | { status: 'signed-in', accountId: string }} CompleteResult
 */
