import crypto from 'node:crypto'

import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { config } from '~/src/config/index.js'
import { normaliseMobile } from '~/src/lib/phone.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import { sendOtp } from '~/src/repositories/notifier.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'

/**
 * The single OTP purpose in this story: proof of email control for sign-in.
 * Purpose values are JOURNEY_CHALLENGE — they name the authority granted,
 * never the journey alone or the challenge alone (see the spec's purpose
 * naming rule).
 */
export const SIGNIN_VERIFY_EMAIL = 'SIGNIN_VERIFY_EMAIL'

/**
 * @typedef {{ status: 'invalid' } | { status: 'expired' } | { status: 'phone-required' } | { status: 'signed-in', accountId: string }} VerifyResult
 * @typedef {{ status: 'invalid' } | { status: 'invalid-phone' } | { status: 'signed-in', accountId: string }} CompleteResult
 */

/*
 * The sign-in OTP state machine. Every operation filters on {uid, purpose} —
 * never uid alone — so codes are isolated per interaction AND per authority.
 * Legal transitions (each a single conditional update):
 *   (request)  upsert: fresh hash, attempts 0, verified false, consumed false
 *   (verify)   {verified:false, consumed:false} → consumed (account exists)
 *                                               | verified (no account)
 *   (complete) {verified:true, consumed:false}  → create account → consumed
 */

/**
 * Issues a 6-digit code, stores only its argon2 hash keyed by
 * {uid, purpose} (upsert = resend semantics: one live code per authority
 * per interaction) and delivers the plaintext via Notify
 * @param {{ uid: string, email: string }} input
 */
export async function requestOtp({ uid, email }) {
  const target = email.toLowerCase()
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const codeHash = await argon2.hash(code)
  const expireAt = new Date(Date.now() + config.get('otp.ttlSeconds') * 1000)

  await otpsRepository.upsert(
    { uid, purpose: SIGNIN_VERIFY_EMAIL },
    {
      target,
      codeHash,
      expireAt,
      attempts: 0,
      verified: false,
      consumed: false
    }
  )

  await sendOtp(target, code)

  return {}
}

/**
 * Verifies a code. Identity always derives from the STORED record's
 * target, never the wire. One-way state machine: a verified record cannot
 * be re-verified.
 * @param {{ uid: string, code: string }} input
 * @returns {Promise<VerifyResult>}
 */
export async function verifyOtp({ uid, code }) {
  /** @type {VerifyResult} */
  const fail = { status: 'invalid' }
  const filter = {
    uid,
    purpose: SIGNIN_VERIFY_EMAIL,
    verified: false,
    consumed: false
  }
  const doc = await otpsRepository.findOne(filter)

  if (!doc) {
    return fail
  }

  if (doc.expireAt.getTime() < Date.now()) {
    return { status: 'expired' }
  }

  const ok = await argon2.verify(doc.codeHash, code)

  if (!ok) {
    const maxAttempts = config.get('otp.maxAttempts')
    const updated = await otpsRepository.incrementAttempts(filter)

    if ((updated?.attempts ?? 0) >= maxAttempts) {
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
    if (!(await otpsRepository.update(claim, { consumed: true }))) {
      return fail // concurrently spent or superseded by a resend
    }
    return { status: 'signed-in', accountId: account._id }
  }

  if (!(await otpsRepository.update(claim, { verified: true }))) {
    return fail
  }
  return { status: 'phone-required' }
}

/**
 * Completes JIT signup: only legal against a verified, unconsumed record
 * for this uid. Account creation precedes consumption so a crash between
 * the two self-heals (the retry finds the account and signs it in).
 * @param {{ uid: string, phone: string }} input
 * @returns {Promise<CompleteResult>}
 */
export async function completeSignup({ uid, phone }) {
  const filter = {
    uid,
    purpose: SIGNIN_VERIFY_EMAIL,
    verified: true,
    consumed: false
  }
  const doc = await otpsRepository.findOne(filter)

  if (!doc) {
    return { status: 'invalid' }
  }

  const e164 = normaliseMobile(phone)

  if (!e164) {
    return { status: 'invalid-phone' }
  }

  const account = await createAccount({ email: doc.target, phone: e164 })

  if (!(await otpsRepository.update(filter, { consumed: true }))) {
    return { status: 'invalid' } // a concurrent submit already completed
  }

  return { status: 'signed-in', accountId: account._id }
}

/**
 * Creates an account. On a duplicate email (racing interaction, or a
 * crash-retry after creation but before the OTP was consumed) the unique
 * index rejects the insert and the existing account is returned instead —
 * the caller signs that account in.
 * @param {{ email: string, phone: string }} input
 */
export async function createAccount({ email, phone }) {
  const now = new Date()
  /** @type {import('~/src/repositories/accounts-repository.js').AccountDocument} */
  const account = {
    _id: crypto.randomUUID(),
    email: email.toLowerCase(),
    emailVerified: true,
    phone,
    phoneVerified: false,
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
