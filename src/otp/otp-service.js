import crypto from 'node:crypto'

import argon2 from 'argon2'

import { config } from '~/src/config/index.js'
import { OTP_CODE_COLLECTION_NAME } from '~/src/mongo.js'

/**
 * @typedef {object} OtpCodeDocument
 * @property {string} _id - the interaction uid the code was issued for
 * @property {string} email - the email the code was sent to
 * @property {string} hash - argon2 hash of the code (plaintext is never stored)
 * @property {Date} expireAt - when the code expires (checked in-app; Mongo TTL is GC only)
 * @property {boolean} consumed - whether the code has been used or burned
 * @property {number} attempts - failed verification attempts so far
 */

/**
 * @typedef {{ ok: false } | { ok: true, accountId: string }} VerifyOtpResult
 */

/**
 * @typedef {object} OtpService
 * @property {(input: { uid: string, email: string }) => Promise<object>} requestOtp - issues and delivers a code
 * @property {(input: { uid: string, email: string, code: string }) => Promise<VerifyOtpResult>} verifyOtp - verifies a code
 */

/**
 * Builds the one-time-code service.
 *
 * `notifier` is the GOV.UK Notify delivery seam (src/otp/notifier.js) and
 * `userService` the users collection seam (src/users/user-service.js). Both
 * are injected so unit tests can substitute fakes; the real wiring always
 * passes the real implementations (see src/plugins/oidc.js). There is no
 * environment branch here: local and production behave identically.
 * @param {Db} db - the connected Mongo database
 * @param {Notifier} notifier
 * @param {{ upsertUserByEmail: (email: string) => Promise<UserDocument> }} userService
 * @returns {OtpService}
 */
export function makeOtpService(db, notifier, userService) {
  const coll = /** @type {Collection<OtpCodeDocument>} */ (
    db.collection(OTP_CODE_COLLECTION_NAME)
  )

  /**
   * Issues a 6-digit code for the interaction, stores only its argon2 hash
   * and delivers the plaintext via the notifier
   * @param {{ uid: string, email: string }} input
   */
  async function requestOtp({ uid, email }) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const hash = await argon2.hash(code)
    const expireAt = new Date(Date.now() + config.get('otp.ttlSeconds') * 1000)

    await coll.updateOne(
      { _id: uid },
      { $set: { email, hash, expireAt, consumed: false, attempts: 0 } },
      { upsert: true }
    )

    await notifier.sendOtp(email, code)

    return {}
  }

  /**
   * Returns { ok: false } for any invalid attempt, or { ok: true, accountId }
   * on success. accountId is the opaque user id minted/loaded from the users
   * collection for the STORED record's email (never the caller's input), so a
   * completion can only ever be for the email the code was issued to — the
   * completion route must use this accountId, not anything off the wire.
   * @param {{ uid: string, email: string, code: string }} input
   * @returns {Promise<VerifyOtpResult>}
   */
  async function verifyOtp({ uid, email, code }) {
    /** @type {VerifyOtpResult} */
    const fail = { ok: false }
    const doc = await coll.findOne({ _id: uid })

    if (!doc || doc.consumed || doc.email !== email) {
      return fail
    }

    if (doc.expireAt.getTime() < Date.now()) {
      return fail
    }

    const ok = await argon2.verify(doc.hash, code)

    if (!ok) {
      const maxAttempts = config.get('otp.maxAttempts')
      const updated = await coll.findOneAndUpdate(
        { _id: uid },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
      )

      if ((updated?.attempts ?? 0) >= maxAttempts) {
        await coll.updateOne({ _id: uid }, { $set: { consumed: true } })
      }

      return fail
    }

    await coll.updateOne({ _id: uid }, { $set: { consumed: true } })

    const user = await userService.upsertUserByEmail(doc.email)

    return { ok: true, accountId: user._id }
  }

  return { requestOtp, verifyOtp }
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Notifier } from '~/src/otp/notifier.js'
 * @import { UserDocument } from '~/src/users/user-service.js'
 */
