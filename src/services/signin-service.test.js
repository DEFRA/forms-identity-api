import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { PURPOSE } from '~/src/constants.js'
import {
  auditOtpIssued,
  auditOtpLockout,
  auditRegistration,
  auditSignIn
} from '~/src/lib/audit.js'
import { sendEmail } from '~/src/lib/notify.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import * as otpLockoutsRepository from '~/src/repositories/otp-lockouts-repository.js'
import * as otpsRepository from '~/src/repositories/otps-repository.js'
import {
  completeSignup,
  createAccount,
  findAccountById,
  findSigninEmail,
  requestOtp,
  verifyOtp
} from '~/src/services/signin-service.js'

jest.mock('~/src/repositories/otps-repository.js', () => ({
  findOne: jest.fn(),
  upsert: jest.fn(),
  update: jest.fn(),
  incrementAttempts: jest.fn()
}))
jest.mock('~/src/repositories/otp-lockouts-repository.js', () => ({
  findOne: jest.fn(),
  update: jest.fn(),
  clear: jest.fn(),
  incrementRequests: jest.fn()
}))
jest.mock('~/src/repositories/accounts-repository.js', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  insert: jest.fn(),
  isDuplicateKeyError: jest.fn()
}))
jest.mock('~/src/lib/notify.js', () => ({
  sendEmail: jest.fn()
}))
jest.mock('~/src/lib/audit.js', () => ({
  auditOtpIssued: jest.fn(),
  auditOtpLockout: jest.fn(),
  auditSignIn: jest.fn(),
  auditRegistration: jest.fn()
}))

/** Codes an address may request in a window before it is locked out */
const MAX_REQUESTS = 5

/** Lockout window and lockout length, both two hours by default */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

/**
 * @typedef {Record<string, any>} Doc
 */

/**
 * The lockout counters the mocked repository is holding for the test in
 * hand — build() replaces them, so a test can age one to move time on
 * @type {Doc[]}
 */
let counters = []

/**
 * Equality as a database applies it: two Dates for the same instant match,
 * even though they are different objects
 * @param {unknown} a
 * @param {unknown} b
 */
function equal(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }
  return a === b
}

/**
 * Backs the mocked otps repository with an in-memory record list so the
 * service's state machine is exercised against real filter semantics
 */
function build() {
  /** @type {Doc[]} */
  const docs = []
  let nextId = 1

  /** @param {Doc} filter */
  const match = (filter) =>
    docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v))

  jest.mocked(otpsRepository.findOne).mockImplementation((filter) => {
    // return a copy: reads must be snapshots, as with a real database, so
    // stale-read scenarios are actually stale
    const doc = match(filter)
    return Promise.resolve(/** @type {never} */ (doc ? { ...doc } : null))
  })
  jest.mocked(otpsRepository.upsert).mockImplementation((key, fields) => {
    const doc = match(key)
    if (doc) {
      Object.assign(doc, fields)
    } else {
      docs.push({ _id: nextId++, createdAt: new Date(), ...key, ...fields })
    }
    return Promise.resolve()
  })
  jest.mocked(otpsRepository.update).mockImplementation((filter, fields) => {
    const doc = match(filter)
    if (doc) {
      Object.assign(doc, fields)
    }
    return Promise.resolve(Boolean(doc))
  })
  jest.mocked(otpsRepository.incrementAttempts).mockImplementation((filter) => {
    const doc = match(filter)
    if (!doc) {
      return Promise.resolve(null)
    }
    doc.attempts = Number(doc.attempts ?? 0) + 1
    return Promise.resolve(/** @type {never} */ (doc))
  })
  buildLockouts()
  jest.mocked(sendEmail).mockResolvedValue(undefined)
  jest.mocked(accountsRepository.findByEmail).mockResolvedValue(null)

  return docs
}

/**
 * Backs the mocked lockout repository with an in-memory counter list, so the
 * count, the window and the lockout are exercised against real filter
 * semantics rather than stubbed answers
 */
function buildLockouts() {
  counters = []
  let nextId = 1

  /** @param {Doc} filter */
  const match = (filter) =>
    counters.find((d) =>
      Object.entries(filter).every(([k, v]) => equal(d[k], v))
    )

  jest.mocked(otpLockoutsRepository.findOne).mockImplementation((filter) => {
    const doc = match(filter)
    return Promise.resolve(/** @type {never} */ (doc ? { ...doc } : null))
  })
  jest
    .mocked(otpLockoutsRepository.update)
    .mockImplementation((filter, fields) => {
      const doc = match(filter)
      if (doc) {
        Object.assign(doc, fields)
      }
      return Promise.resolve(Boolean(doc))
    })
  jest.mocked(otpLockoutsRepository.clear).mockImplementation((filter) => {
    const doc = match(filter)
    if (doc) {
      counters.splice(counters.indexOf(doc), 1)
    }
    return Promise.resolve()
  })
  jest
    .mocked(otpLockoutsRepository.incrementRequests)
    .mockImplementation((key, fields, onInsert) => {
      let doc = match(key)
      if (!doc) {
        doc = {
          _id: nextId++,
          createdAt: new Date(),
          requests: 0,
          ...key,
          ...onInsert
        }
        counters.push(doc)
      }
      Object.assign(doc, fields)
      doc.requests = Number(doc.requests ?? 0) + 1
      return Promise.resolve(/** @type {never} */ ({ ...doc }))
    })
}

/**
 * Moves the counter for an address back in time by the given milliseconds,
 * which is how these tests age a window or a lockout out
 * @param {string} target
 * @param {number} ms
 */
function ageCounter(target, ms) {
  const counter = /** @type {Doc} */ (counters.find((d) => d.target === target))
  counter.windowStartedAt = new Date(counter.windowStartedAt.getTime() - ms)
  if (counter.lockedUntil) {
    counter.lockedUntil = new Date(counter.lockedUntil.getTime() - ms)
  }
}

/**
 * The code from the most recent Notify email
 * @returns {string}
 */
function lastSentCode() {
  const personalisation = jest.mocked(sendEmail).mock.calls.at(-1)?.[2]
  return /** @type {string} */ (personalisation?.code)
}

/**
 * Requests a code for the uid and returns the code that "was sent"
 * @param {string} uid
 */
async function request(uid, email = 'a@b.com') {
  await requestOtp(uid, email)
  return lastSentCode()
}

describe('signin service', () => {
  describe('requestOtp', () => {
    it('stores an argon2 hash keyed by {uid, purpose} and sends the code', async () => {
      const docs = build()

      await requestOtp('uid-1', 'A@B.com')

      expect(sendEmail).toHaveBeenCalledWith(
        process.env.NOTIFY_OTP_TEMPLATE_ID,
        'a@b.com',
        { code: expect.stringMatching(/^\d{6}$/), expiry_minutes: 15 }
      )
      const code = lastSentCode()
      const doc = docs[0]
      expect(doc.uid).toBe('uid-1')
      expect(doc.purpose).toBe(PURPOSE.SIGNIN_VERIFY_EMAIL)
      expect(doc.target).toBe('a@b.com')
      expect(doc.consumed).toBe(false)
      expect(doc.verified).toBe(false)
      expect(doc.attempts).toBe(0)
      expect(doc.codeHash).not.toContain(code)
      await expect(argon2.verify(doc.codeHash, code)).resolves.toBe(true)
    })

    it('issues six digit codes across the whole range, zeros included', async () => {
      // the leading zero is part of the code: it is what gets hashed and what
      // the email shows. Hashing is stubbed only because argon2 is slow.
      const hash = jest
        .spyOn(argon2, 'hash')
        .mockResolvedValue('$argon2id$stub')
      let sawLeadingZero = false

      try {
        for (let attempt = 0; attempt < 500; attempt++) {
          build()
          await requestOtp('uid-1', 'a@b.com')
          const code = lastSentCode()
          expect(code).toMatch(/^\d{6}$/)
          sawLeadingZero ||= code.startsWith('0')
        }
      } finally {
        hash.mockRestore()
      }

      expect(sawLeadingZero).toBe(true)
    })

    it('audits the issue against the interaction and the normalised address', async () => {
      build()

      await requestOtp('uid-1', 'A@B.com')

      expect(auditOtpIssued).toHaveBeenCalledWith('uid-1', 'a@b.com')
    })

    it('audits every resend, so the trail counts the codes sent', async () => {
      build()

      await requestOtp('uid-1', 'a@b.com')
      await requestOtp('uid-1', 'a@b.com')

      expect(auditOtpIssued).toHaveBeenCalledTimes(2)
    })

    it('does not audit an issue when the code could not be sent', async () => {
      // the record means a code reached the address: a Notify failure is not
      // an issued code, and the caller sees the error
      build()
      jest.mocked(sendEmail).mockRejectedValue(new Error('Notify is down'))

      await expect(requestOtp('uid-1', 'a@b.com')).rejects.toThrow(
        'Notify is down'
      )
      expect(auditOtpIssued).not.toHaveBeenCalled()
    })
  })

  describe('requestOtp lockout', () => {
    it('issues the codes up to the limit', async () => {
      build()

      for (let i = 0; i < MAX_REQUESTS; i++) {
        await expect(requestOtp(`uid-${i}`, 'a@b.com')).resolves.toEqual({
          status: 'otp-issued'
        })
      }

      expect(sendEmail).toHaveBeenCalledTimes(MAX_REQUESTS)
      expect(auditOtpLockout).not.toHaveBeenCalled()
    })

    it('locks the address out on the request past the limit, sending no code', async () => {
      const docs = build()
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }
      jest.mocked(sendEmail).mockClear()

      const result = await requestOtp('uid-over', 'a@b.com')

      expect(result).toEqual({
        status: 'locked-out',
        lockedUntil: expect.any(String)
      })
      expect(sendEmail).not.toHaveBeenCalled()
      expect(auditOtpIssued).toHaveBeenCalledTimes(MAX_REQUESTS)
      // the refused request leaves no code behind for the interaction it
      // was made on, so there is nothing to verify against
      expect(docs.some((doc) => doc.uid === 'uid-over')).toBe(false)
    })

    it('locks out for the configured duration and audits it once', async () => {
      build()
      const before = Date.now()

      for (let i = 0; i <= MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }
      await requestOtp('uid-again', 'a@b.com')

      const lockedUntil = counters[0].lockedUntil.getTime()
      expect(lockedUntil).toBeGreaterThanOrEqual(before + TWO_HOURS_MS)
      expect(lockedUntil).toBeLessThanOrEqual(Date.now() + TWO_HOURS_MS)
      expect(auditOtpLockout).toHaveBeenCalledTimes(1)
      expect(auditOtpLockout).toHaveBeenCalledWith(
        'uid-5',
        'a@b.com',
        new Date(lockedUntil)
      )
    })

    it('keeps refusing while the lockout holds, without pushing the clock out', async () => {
      build()
      for (let i = 0; i <= MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }
      const lockedUntil = counters[0].lockedUntil

      const result = await requestOtp('uid-later', 'a@b.com')

      expect(result).toEqual({
        status: 'locked-out',
        lockedUntil: lockedUntil.toISOString()
      })
      expect(counters[0].lockedUntil).toEqual(lockedUntil)
      expect(auditOtpLockout).toHaveBeenCalledTimes(1)
    })

    it('counts requests against the address, not the interaction', async () => {
      // a fresh interaction per request is exactly what an attacker would
      // do, so the count has to follow the address
      build()
      /** @type {Awaited<ReturnType<typeof requestOtp>>} */
      let result = { status: 'otp-issued' }

      for (let i = 0; i <= MAX_REQUESTS; i++) {
        result = await requestOtp(`uid-${i}`, 'A@B.com')
      }

      expect(result).toEqual({
        status: 'locked-out',
        lockedUntil: expect.any(String)
      })
    })

    it('counts each address separately', async () => {
      build()
      for (let i = 0; i <= MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }

      await expect(requestOtp('uid-other', 'c@d.com')).resolves.toEqual({
        status: 'otp-issued'
      })
    })

    it('starts the count again once the lockout has passed', async () => {
      build()
      for (let i = 0; i <= MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }

      ageCounter('a@b.com', TWO_HOURS_MS)

      await expect(requestOtp('uid-after', 'a@b.com')).resolves.toEqual({
        status: 'otp-issued'
      })
      expect(counters[0].requests).toBe(1)
      expect(counters[0].lockedUntil).toBeNull()
    })

    it('starts the count again once the window has passed without a lockout', async () => {
      build()
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }

      ageCounter('a@b.com', TWO_HOURS_MS)

      await expect(requestOtp('uid-after', 'a@b.com')).resolves.toEqual({
        status: 'otp-issued'
      })
      expect(counters[0].requests).toBe(1)
    })

    it('keeps counting within the window when it has not elapsed', async () => {
      build()
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }

      ageCounter('a@b.com', TWO_HOURS_MS - 60_000) // a minute of window left

      await expect(requestOtp('uid-over', 'a@b.com')).resolves.toEqual({
        status: 'locked-out',
        lockedUntil: expect.any(String)
      })
    })

    it('puts the count back to zero when an existing account signs in', async () => {
      const docs = build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(
          /** @type {never} */ ({ _id: 'acc-1', email: 'a@b.com' })
        )
      const code = await request('uid-0')
      for (let i = 1; i < MAX_REQUESTS; i++) {
        await request(`uid-${i}`)
      }

      expect(await verifyOtp('uid-0', code)).toEqual({
        status: 'signed-in',
        accountId: 'acc-1'
      })

      expect(counters).toHaveLength(0)
      // the request that would have locked the address now gets a code
      await expect(requestOtp('uid-next', 'a@b.com')).resolves.toEqual({
        status: 'otp-issued'
      })
      expect(docs.some((doc) => doc.uid === 'uid-next')).toBe(true)
    })

    it('puts the count back to zero when a new account completes signup', async () => {
      build()
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))
      const code = await request('uid-0')
      for (let i = 1; i < MAX_REQUESTS; i++) {
        await request(`uid-${i}`)
      }
      await verifyOtp('uid-0', code)

      expect(await completeSignup('uid-0', '07911 123456')).toEqual({
        status: 'signed-in',
        accountId: expect.any(String)
      })

      expect(counters).toHaveLength(0)
      await expect(requestOtp('uid-next', 'a@b.com')).resolves.toEqual({
        status: 'otp-issued'
      })
    })

    it('leaves the count alone until the sign-in actually completes', async () => {
      // the right code with no account yet only opens the phone step: the
      // budget goes back when the citizen is in, not on the way there
      build()
      const code = await request('uid-0')

      expect(await verifyOtp('uid-0', code)).toEqual({
        status: 'phone-required'
      })

      expect(counters[0].requests).toBe(1)
    })

    it('leaves the count alone on a wrong code', async () => {
      build()
      await request('uid-0')

      await verifyOtp('uid-0', '000001')

      expect(counters[0].requests).toBe(1)
    })

    it('does not audit a lockout a concurrent request has already recorded', async () => {
      // two requests go past the limit at once: only the one whose write
      // lands owns the lockout, and only it writes the audit record
      build()
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await requestOtp(`uid-${i}`, 'a@b.com')
      }
      jest.mocked(otpLockoutsRepository.update).mockResolvedValue(false)

      const result = await requestOtp('uid-over', 'a@b.com')

      expect(result.status).toBe('locked-out')
      expect(auditOtpLockout).not.toHaveBeenCalled()
    })
  })

  describe('verifyOtp', () => {
    it('stops accepting guesses once the budget is spent, even if the record was never marked used', async () => {
      // the write that marks the record used is a tidy-up, not the guard: a
      // blip or a crash between the two operations must not hand out a sixth
      // guess
      build()
      const code = await request('uid-budget')
      const wrong = code === '000000' ? '111111' : '000000'

      // the only write this path makes is the one marking the record used,
      // so failing every update simulates that write never landing
      jest.mocked(otpsRepository.update).mockResolvedValue(false)

      for (let i = 0; i < 5; i++) {
        await verifyOtp('uid-budget', wrong)
      }

      await expect(verifyOtp('uid-budget', code)).resolves.toEqual({
        status: 'invalid-code-consumed-or-expired'
      })
    })

    it('signs in immediately when an account exists', async () => {
      const docs = build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(
          /** @type {never} */ ({ _id: 'acc-1', email: 'a@b.com' })
        )
      const code = await request('uid-1')

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-1' })
      expect(docs[0].consumed).toBe(true)
      expect(auditSignIn).toHaveBeenCalledTimes(1)
      expect(auditSignIn).toHaveBeenCalledWith('acc-1', 'a@b.com', 'uid-1')
      expect(auditRegistration).not.toHaveBeenCalled()
    })

    it('audits the sign in against the interaction it happened on', async () => {
      // the uid ties the sign in back to the OtpIssued record for the code
      // that granted it, so it has to be the interaction, not a fixed value
      build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(
          /** @type {never} */ ({ _id: 'acc-1', email: 'a@b.com' })
        )
      const code = await request('uid-other')

      await verifyOtp('uid-other', code)

      expect(auditSignIn).toHaveBeenCalledWith('acc-1', 'a@b.com', 'uid-other')
    })

    it('does not audit a sign in when the record is consumed by a concurrent request', async () => {
      build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-1' }))
      const code = await request('uid-1')
      jest.mocked(otpsRepository.update).mockResolvedValueOnce(false)

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid' })
      expect(auditSignIn).not.toHaveBeenCalled()
    })

    it('requires the phone step when no account exists', async () => {
      const docs = build()
      const code = await request('uid-1')

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'phone-required' })
      expect(docs[0].verified).toBe(true)
      expect(docs[0].consumed).toBe(false)
      expect(auditSignIn).not.toHaveBeenCalled()
      expect(auditRegistration).not.toHaveBeenCalled()
    })

    it('rejects a code minted for another interaction and burns the local attempt', async () => {
      const docs = build()
      const codeA = await request('uid-a')
      await request('uid-b')

      const result = await verifyOtp('uid-b', codeA)

      expect(result).toEqual({ status: 'invalid' })
      expect(docs.find((d) => d.uid === 'uid-b')?.attempts).toBe(1)
      expect(docs.find((d) => d.uid === 'uid-a')?.attempts).toBe(0)
    })

    it('never matches a record of a different purpose on the same uid', async () => {
      const docs = build()
      const code = await request('uid-1')
      // seed a future SMS/recovery record sharing the uid
      docs.push({
        _id: 99,
        uid: 'uid-1',
        purpose: 'RECOVERY_VERIFY_PHONE',
        target: '+447911123456',
        codeHash: docs[0].codeHash,
        attempts: 0,
        verified: false,
        consumed: false,
        expireAt: new Date(Date.now() + 60_000)
      })

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'phone-required' })
      const recovery = docs.find((d) => d.purpose === 'RECOVERY_VERIFY_PHONE')
      expect(recovery?.verified).toBe(false)
      expect(recovery?.consumed).toBe(false)
    })

    it('rejects expired codes as invalid (in-app check; Mongo TTL is lazy GC)', async () => {
      const docs = build()
      const code = await request('uid-1')
      docs[0].expireAt = new Date(Date.now() - 1000)

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid-code-consumed-or-expired' })
    })

    it('still accepts the right code after 4 wrong attempts (the budget is 5)', async () => {
      const docs = build()
      const code = await request('uid-1')

      for (let i = 0; i < 4; i++) {
        await verifyOtp('uid-1', '000001')
      }
      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'phone-required' })
      expect(docs[0].consumed).toBe(false)
    })

    it('burns the record after 5 wrong attempts, then rejects the right code', async () => {
      const docs = build()
      const code = await request('uid-1')

      for (let i = 0; i < 5; i++) {
        await verifyOtp('uid-1', '000001')
      }
      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid-code-consumed-or-expired' })
      expect(docs[0].consumed).toBe(true)
    })

    it('rejects re-verification once verified (one-way state machine)', async () => {
      build()
      const code = await request('uid-1')
      await verifyOtp('uid-1', code)

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid-code-consumed-or-expired' })
    })

    it.each([
      '1',
      '12',
      '123',
      '1234',
      '12345',
      '1234567',
      '12345678',
      'abc123',
      '*&^%$£'
    ])('returns invalid-code-format (%s)', async (code) => {
      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid-code-format' })
    })
  })

  describe('completeSignup', () => {
    /** Drives uid-1 to the verified state, returns the record list */
    async function verified() {
      const docs = build()
      const code = await request('uid-1')
      await verifyOtp('uid-1', code)
      return docs
    }

    it('creates the account from the stored email and consumes the record', async () => {
      const docs = await verified()
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))

      const result = await completeSignup('uid-1', '07911 123456')

      expect(accountsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'a@b.com',
          phone: '+447911123456',
          status: 'active'
        })
      )
      expect(result).toEqual({
        status: 'signed-in',
        accountId: expect.stringMatching(/^[0-9a-f-]{36}$/)
      })
      expect(docs[0].consumed).toBe(true)
      const { accountId } = /** @type {{ accountId: string }} */ (result)
      expect(auditRegistration).toHaveBeenCalledTimes(1)
      expect(auditRegistration).toHaveBeenCalledWith(
        accountId,
        'a@b.com',
        '+447911123456'
      )
      expect(auditSignIn).toHaveBeenCalledTimes(1)
      expect(auditSignIn).toHaveBeenCalledWith(accountId, 'a@b.com', 'uid-1')
    })

    it('audits the existing account when the email already has one (duplicate race)', async () => {
      await verified()
      const existing = { _id: 'acc-existing', email: 'a@b.com' }
      jest
        .mocked(accountsRepository.insert)
        .mockRejectedValue(new Error('E11000'))
      jest.mocked(accountsRepository.isDuplicateKeyError).mockReturnValue(true)
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(/** @type {never} */ (existing))

      const result = await completeSignup('uid-1', '07911 123456')

      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-existing' })
      expect(auditRegistration).toHaveBeenCalledWith(
        'acc-existing',
        'a@b.com',
        undefined
      )
      expect(auditSignIn).toHaveBeenCalledWith(
        'acc-existing',
        'a@b.com',
        'uid-1'
      )
    })

    it('rejects an invalid phone without consuming the record', async () => {
      const docs = await verified()

      const result = await completeSignup('uid-1', '020 7946 0000')

      expect(result).toEqual({ status: 'invalid-phone' })
      expect(docs[0].consumed).toBe(false)
      expect(auditRegistration).not.toHaveBeenCalled()
      expect(auditSignIn).not.toHaveBeenCalled()
    })

    it('rejects completion without a verified record (out-of-order call)', async () => {
      build()
      await request('uid-1')

      const result = await completeSignup('uid-1', '07911 123456')

      expect(result).toEqual({ status: 'invalid' })
      expect(accountsRepository.insert).not.toHaveBeenCalled()
    })

    it('rejects completion for a different uid', async () => {
      await verified()

      const result = await completeSignup('uid-other', '07911 123456')

      expect(result).toEqual({ status: 'invalid' })
    })

    it('rejects a second completion (consumed)', async () => {
      await verified()
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))
      await completeSignup('uid-1', '07911 123456')

      const result = await completeSignup('uid-1', '07911 123456')

      expect(result).toEqual({ status: 'invalid' })
      expect(accountsRepository.insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('createAccount', () => {
    it('returns the existing account on a duplicate email', async () => {
      build()
      const existing = { _id: 'abc', email: 'citizen@example.com' }
      jest
        .mocked(accountsRepository.insert)
        .mockRejectedValue(new Error('E11000'))
      jest.mocked(accountsRepository.isDuplicateKeyError).mockReturnValue(true)
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(/** @type {never} */ (existing))

      const account = await createAccount(
        'Citizen@Example.com',
        '+447911123456'
      )

      expect(account).toBe(existing)
      expect(accountsRepository.findByEmail).toHaveBeenCalledWith(
        'citizen@example.com'
      )
    })

    it('rethrows non-duplicate errors', async () => {
      build()
      jest
        .mocked(accountsRepository.insert)
        .mockRejectedValue(new Error('boom'))
      jest.mocked(accountsRepository.isDuplicateKeyError).mockReturnValue(false)

      await expect(createAccount('a@b.com', '+447911123456')).rejects.toThrow(
        'boom'
      )
    })
  })

  describe('findAccountById', () => {
    it('returns the account when it exists', async () => {
      build()
      const account = { _id: 'acc-1', email: 'a@b.com' }
      jest
        .mocked(accountsRepository.findById)
        .mockResolvedValue(/** @type {never} */ (account))

      await expect(findAccountById('acc-1')).resolves.toBe(account)
    })

    it('throws Boom.notFound for an unknown account', async () => {
      build()
      jest.mocked(accountsRepository.findById).mockResolvedValue(null)

      await expect(findAccountById('gone')).rejects.toThrow(
        Boom.notFound('Account not found')
      )
    })
  })

  describe('transition races', () => {
    it('verify returns invalid when a concurrent request spends the code first', async () => {
      build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-1' }))
      const code = await request('uid-1')
      jest.mocked(otpsRepository.update).mockResolvedValueOnce(false)

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid' })
    })

    it('verify returns invalid when a concurrent request verifies first', async () => {
      build()
      const code = await request('uid-1')
      jest.mocked(otpsRepository.update).mockResolvedValueOnce(false)

      const result = await verifyOtp('uid-1', code)

      expect(result).toEqual({ status: 'invalid' })
    })

    it('completeSignup returns invalid when a concurrent submit completes first', async () => {
      const docs = build()
      const code = await request('uid-1')
      await verifyOtp('uid-1', code)
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))
      jest.mocked(otpsRepository.update).mockResolvedValueOnce(false)

      const result = await completeSignup('uid-1', '07911 123456')

      expect(result).toEqual({ status: 'invalid' })
      expect(docs[0].verified).toBe(true)
      expect(auditRegistration).not.toHaveBeenCalled()
      expect(auditSignIn).not.toHaveBeenCalled()
    })
  })

  describe('resend supersession', () => {
    it('does not honour a code once a resend has replaced it (stale claim)', async () => {
      build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-1' }))
      const codeA = await request('uid-1')
      // simulate the resend landing between verify's read and its claim:
      // the in-memory repo re-checks the claim filter, so replacing the
      // hash after the read makes the pinned claim miss
      const originalFindOne = jest
        .mocked(otpsRepository.findOne)
        .getMockImplementation()
      jest
        .mocked(otpsRepository.findOne)
        .mockImplementationOnce(async (filter) => {
          const doc = await /** @type {NonNullable<typeof originalFindOne>} */ (
            originalFindOne
          )(filter)
          // resend fires immediately after the read
          await request('uid-1')
          return doc
        })

      const result = await verifyOtp('uid-1', codeA)

      expect(result).toEqual({ status: 'invalid' })
    })

    it('a stale wrong guess never spends or burns the fresh code (pinned counter)', async () => {
      const docs = build()
      await request('uid-1')
      docs[0].attempts = 4 // one wrong guess away from burning
      // resend fires between verify's read and its attempt increment; the
      // pinned claim must miss the replaced hash
      const originalFindOne = jest
        .mocked(otpsRepository.findOne)
        .getMockImplementation()
      jest
        .mocked(otpsRepository.findOne)
        .mockImplementationOnce(async (filter) => {
          const doc = await /** @type {NonNullable<typeof originalFindOne>} */ (
            originalFindOne
          )(filter)
          await request('uid-1')
          return doc
        })

      const result = await verifyOtp('uid-1', '000001')

      expect(result).toEqual({ status: 'invalid' })
      expect(docs[0].attempts).toBe(0)
      expect(docs[0].consumed).toBe(false)
    })
  })

  describe('resend', () => {
    it('replaces the code: the old one stops working and the new one works', async () => {
      const docs = build()
      const codeA = await request('uid-1')
      const codeB = await request('uid-1')

      expect(docs).toHaveLength(1)
      expect(await verifyOtp('uid-1', codeA)).toEqual({ status: 'invalid' })
      expect(await verifyOtp('uid-1', codeB)).toEqual({
        status: 'phone-required'
      })
    })

    it('restores the full attempt budget for the new code', async () => {
      build()
      await request('uid-1')
      for (let i = 0; i < 4; i++) {
        await verifyOtp('uid-1', '000001')
      }
      const codeB = await request('uid-1')
      for (let i = 0; i < 4; i++) {
        await verifyOtp('uid-1', '000001')
      }

      expect(await verifyOtp('uid-1', codeB)).toEqual({
        status: 'phone-required'
      })
    })

    it('reopens a burned interaction with a fresh code and budget', async () => {
      // The 5-attempt budget guards each code, not the interaction: a resend
      // mints a new code with a new budget. Overall guessing volume is the
      // job of request throttling, which the ticket has yet to decide on.
      build()
      await request('uid-1')
      for (let i = 0; i < 5; i++) {
        await verifyOtp('uid-1', '000001')
      }
      const codeB = await request('uid-1')

      expect(await verifyOtp('uid-1', codeB)).toEqual({
        status: 'phone-required'
      })
    })

    it('during the phone step drops the interaction back to unverified', async () => {
      // A resend re-runs the email challenge from scratch, so an in-flight
      // signup must re-verify before completion is legal again
      build()
      const codeA = await request('uid-1')
      await verifyOtp('uid-1', codeA)
      await request('uid-1')

      const result = await completeSignup('uid-1', '07911 123456')

      expect(result).toEqual({ status: 'invalid' })
      expect(accountsRepository.insert).not.toHaveBeenCalled()
    })
  })

  describe('findSigninEmail', () => {
    it('returns the stored target for the interaction', async () => {
      build()
      await request('uid-1', 'Someone@Example.com')

      await expect(findSigninEmail('uid-1')).resolves.toBe(
        'someone@example.com'
      )
    })

    it('throws Boom.notFound when no code was requested', async () => {
      build()

      await expect(findSigninEmail('uid-none')).rejects.toThrow(
        Boom.notFound('No sign-in code for this interaction')
      )
    })
  })
})
