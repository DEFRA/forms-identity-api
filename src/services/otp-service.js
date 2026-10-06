import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { config } from '~/src/config/index.js'
import { PURPOSE, STATUS, TRANSPORT } from '~/src/constants.js'
import {
  auditOtpIssued,
  auditOtpLockout,
  auditSignIn
} from '~/src/lib/audit.js'
import { sendEmail, sendSms } from '~/src/lib/notify.js'
import { codeSchema, generateCode } from '~/src/otp-code.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpLockoutsRepository from '~/src/repositories/otp-lockouts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

const OTP_TTL_SECONDS = config.get('otp.ttlSeconds')
const OTP_MAX_ATTEMPTS = config.get('otp.maxAttempts')
const OTP_EXPIRY_MINUTES = Math.round(OTP_TTL_SECONDS / 60)
const OTP_NOTIFY_TEMPLATE_ID = config.get('otp.notify.templateId')
const OTP_NOTIFY_SMS_TEMPLATE_ID = config.get('otp.notify.smsTemplateId')
const LOCKOUT_MAX_REQUESTS = config.get('otp.lockout.maxRequests')
const LOCKOUT_WINDOW_MS = config.get('otp.lockout.windowSeconds') * 1000
const LOCKOUT_MS = config.get('otp.lockout.durationSeconds') * 1000

/**
 * @typedef {{ codeHash: string, uid: string, purpose: PurposeType, verified: boolean, consumed: boolean, accountId?: string }} ClaimType
 */

// Every OTP operation filters on {uid, purpose, and possibly accountId} — never uid alone — so codes
// are isolated per interaction and per purpose.

/**
 * Issues a 6-digit code, stores only its argon2 hash keyed by
 * {uid, purpose} (upsert = resend semantics: one live code per authority
 * per interaction) and delivers the plaintext via Notify
 * @param {string} uid
 * @param { string | undefined } email - not used if sending by SMS
 * @param {typeof TRANSPORT[keyof typeof TRANSPORT]} transportType
 * @param {PurposeType} purpose
 * @param {string} [accountId] - id of account if email address not passed in
 */
export async function requestOtp(
  uid,
  email,
  transportType,
  purpose,
  accountId
) {
  let target = email?.toLowerCase()
  let accountEmail = ''

  if (purpose === PURPOSE.SIGNIN_VERIFY_EMAIL && target) {
    const lockedUntil = await claimOtpRequest(uid, target)

    if (lockedUntil) {
      return {
        status: STATUS.LOCKED_OUT,
        lockedUntil: lockedUntil.toISOString()
      }
    }
  }

  if (accountId) {
    // Verify account exists
    const account = await accountsRepository.findById(accountId)
    if (!account) {
      throw Boom.badRequest()
    }

    if (purpose === PURPOSE.ACCOUNT_VERIFY_PHONE) {
      // Get phone from account - ignore anything passed in
      target = account.phone
      // Get account email for auditing purposes
      accountEmail = account.email
    }
  }

  if (!target) {
    throw Boom.badRequest()
  }

  const code = generateCode()
  const codeHash = await argon2.hash(code)
  const expireAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

  await otpsRepository.upsert(
    { uid, purpose },
    {
      target,
      accountId,
      codeHash,
      expireAt,
      attempts: 0,
      verified: false,
      consumed: false
    }
  )

  if (transportType === TRANSPORT.EMAIL) {
    await sendOtpEmail(target, code)
    auditOtpIssued(uid, target)
  } else {
    await sendOtpSms(target, code)
    auditOtpIssued(uid, accountEmail, target)
  }

  return { status: STATUS.OTP_ISSUED }
}

/**
 * Counts this request against the address's rolling window and reports when
 * the address may next ask for a code, or null when this request is allowed.
 *
 * The counter is keyed on the address alone, not on the interaction, so
 * starting a fresh interaction for every request does not buy a fresh count.
 * @param {string} uid
 * @param {string} target - lowercased email
 * @returns {Promise<Date | null>} when the lockout lifts, or null if not locked out
 */
async function claimOtpRequest(uid, target) {
  const now = new Date()
  const key = { target }
  const existing = await otpLockoutsRepository.findOne(key)

  // The address is locked. Refuse the request and leave the record as it
  // is, so that requests during a lockout keep the same unlock time
  if (existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime()) {
    return existing.lockedUntil
  }

  if (existing && hasWindowElapsed(existing, now)) {
    // The record is from a window or a lockout that has ended. Start a new
    // window: set the count to zero and clear the old lock. Without this
    // step, the old count stays and this request is refused.
    //
    // The filter includes the windowStartedAt value that was read, so that
    // only one of several concurrent requests does the reset. The others
    // match nothing and their counts are added to the new window.
    await otpLockoutsRepository.update(
      { ...key, windowStartedAt: existing.windowStartedAt },
      { windowStartedAt: now, requests: 0, lockedUntil: null }
    )
  }

  // Count this request. The first request for an address creates the
  // record. Each request moves expireAt forward, so that Mongo deletes the
  // record only after the window and a possible lockout have both ended.
  const counter = await otpLockoutsRepository.incrementRequests(
    key,
    { expireAt: new Date(now.getTime() + LOCKOUT_WINDOW_MS + LOCKOUT_MS) },
    { windowStartedAt: now, lockedUntil: null }
  )

  if (counter.requests <= LOCKOUT_MAX_REQUESTS) {
    // The count is in the limit: permit the request.
    return null
  }

  // The count is above the limit: lock the address. The filter matches
  // only a record that has no lock, so that one of several concurrent
  // requests sets the lock and writes the audit record. The others are
  // refused with no second audit record.
  const lockedUntil = new Date(now.getTime() + LOCKOUT_MS)

  const locked = await otpLockoutsRepository.update(
    { ...key, lockedUntil: null },
    { lockedUntil }
  )

  if (locked) {
    auditOtpLockout(uid, target, lockedUntil)
  }

  return lockedUntil
}

/**
 * Whether the counter that was just read belongs to a window that is over,
 * so this request starts a new count.
 *
 * A lockout ends its own window: once it lifts the address gets a clean
 * count, otherwise the requests that caused it would lock it again at once.
 *
 * Mongo TTL is lazy and isn't evaluated in real time, so the window is
 * checked in-app rather than trusted to have been swept away.
 * @param {OtpLockoutDocument} counter
 * @param {Date} now
 */
function hasWindowElapsed(counter, now) {
  if (counter.lockedUntil) {
    return counter.lockedUntil.getTime() <= now.getTime()
  }

  return counter.windowStartedAt.getTime() + LOCKOUT_WINDOW_MS <= now.getTime()
}

/**
 * Puts the code request count for an address back to zero, so the next
 * sign-in starts with a full budget.
 *
 * A completed sign-in proves the codes were reaching the person who owns the
 * address, so the count they ran up getting in should not follow them into
 * their next sign-in.
 * @param {string} target - lowercased email
 */
export function clearRequestCount(target) {
  return otpLockoutsRepository.clear({ target })
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
 * Sends a security code by SMS through Notify. The template must contain:
 *   ((code))           -> the 6-digit one-time code
 *   ((expiry_minutes)) -> derived from otp.ttlSeconds so the email can never
 *                         drift from the configured TTL
 * @param {string} phoneNumber
 * @param {string} code
 */
function sendOtpSms(phoneNumber, code) {
  return sendSms(OTP_NOTIFY_SMS_TEMPLATE_ID, phoneNumber, {
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
 * @param {PurposeType} purpose
 * @param {string} [id] - account id
 * @returns {Promise<VerifyResult>}
 */
export async function verifyOtp(uid, code, purpose, id) {
  // A code that fails the shape schema cannot be a real code: turn it away as
  // invalid before any lookup, and without spending a guess.
  if (codeSchema.validate(code).error) {
    return { status: STATUS.INVALID_CODE_FORMAT }
  }

  /** @type {{ uid: string, purpose: PurposeType, verified: boolean, consumed: boolean, accountId?: string }} */
  const filter = {
    uid,
    purpose,
    verified: false,
    consumed: false
  }
  if (purpose !== PURPOSE.SIGNIN_VERIFY_EMAIL) {
    filter.accountId = id
  }
  const doc = await otpsRepository.findOne(filter)

  /** @type {VerifyResult} */
  const consumedOrExpiredResult = {
    status: STATUS.INVALID_CODE_CONSUMED_OR_EXPIRED
  }

  if (!doc || !isGuessable(doc)) {
    return consumedOrExpiredResult
  }

  // Every write below pins codeHash so it only lands on the exact record
  // version that was read — a concurrent resend replaces the hash, and a
  // stale guess or superseded code must never spend (or burn) the fresh code
  const claim = { ...filter, codeHash: doc.codeHash }

  const ok = await argon2.verify(doc.codeHash, code)

  /** @type {VerifyResult} */
  const failResult = { status: STATUS.INVALID }

  if (!ok) {
    const consumed = await spendAttempt(claim)

    return consumed ? consumedOrExpiredResult : failResult
  }

  const account = doc.accountId
    ? await accountsRepository.findById(doc.accountId)
    : await accountsRepository.findByEmail(doc.target)

  if (account) {
    return handleWhenAccountExists(account, uid, purpose, claim, failResult)
  }

  const verified = await otpsRepository.update(claim, { verified: true })

  if (!verified) {
    return failResult
  }

  return { status: STATUS.PHONE_REQUIRED }
}

/**
 * @param {WithId<accountsRepository.AccountDocument>} account
 * @param {string} uid
 * @param {PurposeType} purpose
 * @param {ClaimType} claim
 * @param {VerifyResult} failResult
 */
async function handleWhenAccountExists(
  account,
  uid,
  purpose,
  claim,
  failResult
) {
  if (purpose === PURPOSE.SIGNIN_VERIFY_EMAIL) {
    // A successful sign-in shows that the user owns the address, so set the
    // OTP request count back to zero. The next sign-in then starts with the
    // full number of requests.
    await clearRequestCount(account.email)

    const consumed = await otpsRepository.update(claim, { consumed: true })

    if (!consumed) {
      return failResult // concurrently spent or superseded by a resend
    }

    auditSignIn(account._id, account.email, uid)
    return { status: STATUS.SIGNED_IN, accountId: account._id }
  }

  // PURPOSE.ACCOUNT_VERIFY_EMAIL or PURPOSE.ACCOUNT_VERIFY_PHONE
  const verifiedOtp = await otpsRepository.update(claim, { verified: true })

  if (!verifiedOtp) {
    return failResult
  }

  return { status: STATUS.VALID }
}

/**
 * Whether a record that was just read is still open to a guess.
 *
 * Mongo TTL is lazy and isn't evaluated in real time. Double check the
 * expiry in-app in case it hasn't been dropped yet - this is security
 * related, we need to be sure.
 *
 * Likewise the attempt budget. Reaching it marks the record used, but that
 * write can fail or be cut short by a crash, and a lockout that only holds
 * when the last write succeeded is no lockout at all. The count is the
 * authority; marking it used is the tidy-up.
 * @param {OtpDocument} doc
 */
function isGuessable(doc) {
  const isExpired = doc.expireAt.getTime() < Date.now()
  const isSpent = doc.attempts >= OTP_MAX_ATTEMPTS

  return !isExpired && !isSpent
}

/**
 * Spends one attempt against the exact record version that was read. Hitting
 * the budget marks the record used, which is the tidy-up rather than the
 * lockout — isGuessable reads the count on the next attempt and is what
 * actually holds the door shut.
 * @param {Filter<OtpDocument>} claim
 */
async function spendAttempt(claim) {
  const updated = await otpsRepository.incrementAttempts(claim)
  const attempts = updated?.attempts ?? 0
  let consumed = false

  if (attempts >= OTP_MAX_ATTEMPTS) {
    consumed = await otpsRepository.update(claim, { consumed: true })
  }

  return consumed
}

/**
 * Information about the OTP including:
 * - the target (email or phone number) a sign-in code was sent to — display data for the
 * check-your-email/check-your-phone page, read from the stored record (the source of truth
 * verification also uses)
 * - consumed (or not)
 * - verified (or not)
 * @param {string} uid
 * @param {PurposeType} purpose
 * @throws {Boom.Boom} notFound when no code has been requested for the interaction
 */
export async function findOtp(uid, purpose) {
  const doc = await otpsRepository.findOne({
    uid,
    purpose
  })

  if (!doc) {
    throw Boom.notFound(`No code for this interaction of purpose ${purpose}`)
  }

  return {
    target: doc.target,
    verified: doc.verified,
    consumed: doc.consumed
  }
}

/**
 * @import { Filter, WithId } from 'mongodb'
 * @import { OtpDocument } from '~/src/repositories/otps-repository.js'
 * @import { OtpLockoutDocument } from '~/src/repositories/otp-lockouts-repository.js'
 * @import { PurposeType } from '~/src/constants.js'
 * @typedef {{ status: 'invalid' } | { status: 'invalid-code-format' } | { status: 'invalid-code-consumed-or-expired' } | { status: 'phone-required' } | { status: 'signed-in', accountId: string } | { status: 'valid' }} VerifyResult
 * @typedef {{ status: 'invalid' } | { status: 'invalid-phone' } | { status: 'signed-in', accountId: string }} CompleteResult
 */
