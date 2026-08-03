import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { PURPOSE } from '~/src/constants.js'
import { sendEmail } from '~/src/lib/notify.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
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
jest.mock('~/src/repositories/accounts-repository.js', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  insert: jest.fn(),
  isDuplicateKeyError: jest.fn()
}))
jest.mock('~/src/lib/notify.js', () => ({
  sendEmail: jest.fn()
}))

/**
 * @typedef {Record<string, any>} Doc
 */

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
  jest.mocked(sendEmail).mockResolvedValue(undefined)
  jest.mocked(accountsRepository.findByEmail).mockResolvedValue(null)

  return docs
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
  await requestOtp({ uid, email })
  return lastSentCode()
}

describe('signin service', () => {
  describe('requestOtp', () => {
    it('stores an argon2 hash keyed by {uid, purpose} and sends the code', async () => {
      const docs = build()

      await requestOtp({ uid: 'uid-1', email: 'A@B.com' })

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
  })

  describe('verifyOtp', () => {
    it('signs in immediately when an account exists', async () => {
      const docs = build()
      jest
        .mocked(accountsRepository.findByEmail)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-1' }))
      const code = await request('uid-1')

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-1' })
      expect(docs[0].consumed).toBe(true)
    })

    it('requires the phone step when no account exists', async () => {
      const docs = build()
      const code = await request('uid-1')

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'phone-required' })
      expect(docs[0].verified).toBe(true)
      expect(docs[0].consumed).toBe(false)
    })

    it('rejects a code minted for another interaction and burns the local attempt', async () => {
      const docs = build()
      const codeA = await request('uid-a')
      await request('uid-b')

      const result = await verifyOtp({ uid: 'uid-b', code: codeA })

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

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'phone-required' })
      const recovery = docs.find((d) => d.purpose === 'RECOVERY_VERIFY_PHONE')
      expect(recovery?.verified).toBe(false)
      expect(recovery?.consumed).toBe(false)
    })

    it('rejects expired codes as invalid (in-app check; Mongo TTL is lazy GC)', async () => {
      const docs = build()
      const code = await request('uid-1')
      docs[0].expireAt = new Date(Date.now() - 1000)

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
    })

    it('burns the record after 5 wrong attempts, then rejects the right code', async () => {
      const docs = build()
      const code = await request('uid-1')

      for (let i = 0; i < 5; i++) {
        await verifyOtp({ uid: 'uid-1', code: '000001' })
      }
      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
      expect(docs[0].consumed).toBe(true)
    })

    it('rejects re-verification once verified (one-way state machine)', async () => {
      build()
      const code = await request('uid-1')
      await verifyOtp({ uid: 'uid-1', code })

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
    })
  })

  describe('completeSignup', () => {
    /** Drives uid-1 to the verified state, returns the record list */
    async function verified() {
      const docs = build()
      const code = await request('uid-1')
      await verifyOtp({ uid: 'uid-1', code })
      return docs
    }

    it('creates the account from the stored email and consumes the record', async () => {
      const docs = await verified()
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(accountsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'a@b.com',
          phone: '+447911123456',
          emailVerified: true,
          phoneVerified: false
        })
      )
      expect(result).toEqual({
        status: 'signed-in',
        accountId: expect.stringMatching(/^[0-9a-f-]{36}$/)
      })
      expect(docs[0].consumed).toBe(true)
    })

    it('rejects an invalid phone without consuming the record', async () => {
      const docs = await verified()

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '020 7946 0000'
      })

      expect(result).toEqual({ status: 'invalid-phone' })
      expect(docs[0].consumed).toBe(false)
    })

    it('rejects completion without a verified record (out-of-order call)', async () => {
      build()
      await request('uid-1')

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(accountsRepository.insert).not.toHaveBeenCalled()
    })

    it('rejects completion for a different uid', async () => {
      await verified()

      const result = await completeSignup({
        uid: 'uid-other',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
    })

    it('rejects a second completion (consumed)', async () => {
      await verified()
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))
      await completeSignup({ uid: 'uid-1', phone: '07911 123456' })

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

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

      const account = await createAccount({
        email: 'Citizen@Example.com',
        phone: '+447911123456'
      })

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

      await expect(
        createAccount({ email: 'a@b.com', phone: '+447911123456' })
      ).rejects.toThrow('boom')
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

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
    })

    it('verify returns invalid when a concurrent request verifies first', async () => {
      build()
      const code = await request('uid-1')
      jest.mocked(otpsRepository.update).mockResolvedValueOnce(false)

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
    })

    it('completeSignup returns invalid when a concurrent submit completes first', async () => {
      const docs = build()
      const code = await request('uid-1')
      await verifyOtp({ uid: 'uid-1', code })
      jest
        .mocked(accountsRepository.insert)
        .mockImplementation((account) => Promise.resolve(account))
      jest.mocked(otpsRepository.update).mockResolvedValueOnce(false)

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(docs[0].verified).toBe(true)
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

      const result = await verifyOtp({ uid: 'uid-1', code: codeA })

      expect(result).toEqual({ status: 'invalid' })
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
