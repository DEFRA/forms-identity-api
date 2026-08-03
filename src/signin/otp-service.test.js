import argon2 from 'argon2'

import { db } from '~/src/mongo.js'
import { createAccount, findByEmail } from '~/src/signin/accounts-service.js'
import { sendOtp } from '~/src/signin/notifier.js'
import {
  SIGNIN_VERIFY_EMAIL,
  completeSignup,
  requestOtp,
  verifyOtp
} from '~/src/signin/otp-service.js'

jest.mock('~/src/mongo.js', () => ({
  OTPS_COLLECTION_NAME: 'otps',
  ACCOUNTS_COLLECTION_NAME: 'accounts',
  db: { collection: jest.fn() }
}))
jest.mock('~/src/signin/notifier.js', () => ({
  sendOtp: jest.fn()
}))
jest.mock('~/src/signin/accounts-service.js', () => ({
  findByEmail: jest.fn(),
  createAccount: jest.fn()
}))

/**
 * @typedef {Record<string, any>} Doc
 */

/**
 * Minimal in-memory stand-in for the otps collection implementing only the
 * operations the service uses, with real filter semantics for the fields we
 * filter on. `_id` is a counter.
 */
function memoryColl() {
  /** @type {Doc[]} */
  const docs = []
  let nextId = 1

  /** @param {Doc} filter */
  function match(filter) {
    return docs.find((d) =>
      Object.entries(filter).every(([k, v]) => d[k] === v)
    )
  }

  return {
    docs,
    findOne: jest.fn((/** @type {Doc} */ filter) =>
      Promise.resolve(match(filter) ?? null)
    ),
    updateOne: jest.fn(
      (
        /** @type {Doc} */ filter,
        /** @type {Doc} */ update,
        /** @type {Doc | undefined} */ options
      ) => {
        const doc = match(filter)
        if (doc) {
          Object.assign(doc, update.$set ?? {})
          for (const [k, v] of Object.entries(update.$inc ?? {})) {
            doc[k] = Number(doc[k] ?? 0) + Number(v)
          }
        } else if (options?.upsert) {
          docs.push({
            _id: nextId++,
            ...filter,
            ...(update.$setOnInsert ?? {}),
            ...(update.$set ?? {})
          })
        }
        return Promise.resolve({})
      }
    ),
    findOneAndUpdate: jest.fn(
      (/** @type {Doc} */ filter, /** @type {Doc} */ update) => {
        const doc = match(filter)
        if (!doc) {
          return Promise.resolve(null)
        }
        Object.assign(doc, update.$set ?? {})
        for (const [k, v] of Object.entries(update.$inc ?? {})) {
          doc[k] = Number(doc[k] ?? 0) + Number(v)
        }
        return Promise.resolve(doc)
      }
    )
  }
}

/** Wires a fresh in-memory collection into the mocked db and default mocks */
function build() {
  const coll = memoryColl()
  jest.mocked(db.collection).mockReturnValue(/** @type {never} */ (coll))
  jest.mocked(sendOtp).mockResolvedValue(undefined)
  jest.mocked(findByEmail).mockResolvedValue(null)
  return coll
}

/**
 * Requests a code for the uid and returns the code that "was sent"
 * @param {string} uid
 */
async function request(uid, email = 'a@b.com') {
  await requestOtp({ uid, email })
  return /** @type {string} */ (jest.mocked(sendOtp).mock.calls.at(-1)?.[1])
}

describe('otp service', () => {
  describe('requestOtp', () => {
    it('stores an argon2 hash keyed by {uid, purpose} and sends the code', async () => {
      const coll = build()

      await requestOtp({ uid: 'uid-1', email: 'A@B.com' })

      expect(sendOtp).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^\d{6}$/)
      )
      const code = /** @type {string} */ (jest.mocked(sendOtp).mock.calls[0][1])
      const doc = coll.docs[0]
      expect(doc.uid).toBe('uid-1')
      expect(doc.purpose).toBe(SIGNIN_VERIFY_EMAIL)
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
      const coll = build()
      jest
        .mocked(findByEmail)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-1' }))
      const code = await request('uid-1')

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-1' })
      expect(coll.docs[0].consumed).toBe(true)
    })

    it('requires the phone step when no account exists', async () => {
      const coll = build()
      const code = await request('uid-1')

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'phone-required' })
      expect(coll.docs[0].verified).toBe(true)
      expect(coll.docs[0].consumed).toBe(false)
    })

    it('rejects a code minted for another interaction and burns the local attempt', async () => {
      const coll = build()
      const codeA = await request('uid-a')
      await request('uid-b')

      const result = await verifyOtp({ uid: 'uid-b', code: codeA })

      expect(result).toEqual({ status: 'invalid' })
      const docB = coll.docs.find((d) => d.uid === 'uid-b')
      const docA = coll.docs.find((d) => d.uid === 'uid-a')
      expect(docB?.attempts).toBe(1)
      expect(docA?.attempts).toBe(0)
    })

    it('never matches a record of a different purpose on the same uid', async () => {
      const coll = build()
      const code = await request('uid-1')
      // seed a future SMS/recovery record sharing the uid
      coll.docs.push({
        _id: 99,
        uid: 'uid-1',
        purpose: 'RECOVERY_VERIFY_PHONE',
        target: '+447911123456',
        codeHash: coll.docs[0].codeHash,
        attempts: 0,
        verified: false,
        consumed: false,
        expireAt: new Date(Date.now() + 60_000)
      })

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'phone-required' })
      const recovery = coll.docs.find(
        (d) => d.purpose === 'RECOVERY_VERIFY_PHONE'
      )
      expect(recovery?.verified).toBe(false)
      expect(recovery?.consumed).toBe(false)
    })

    it('reports expiry distinctly', async () => {
      const coll = build()
      const code = await request('uid-1')
      coll.docs[0].expireAt = new Date(Date.now() - 1000)

      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'expired' })
    })

    it('burns the record after 5 wrong attempts, then rejects the right code', async () => {
      const coll = build()
      const code = await request('uid-1')

      for (let i = 0; i < 5; i++) {
        await verifyOtp({ uid: 'uid-1', code: '000001' })
      }
      const result = await verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
      expect(coll.docs[0].consumed).toBe(true)
    })

    it('rejects malformed codes without argon2 work but burns an attempt', async () => {
      const coll = build()
      await request('uid-1')

      const result = await verifyOtp({ uid: 'uid-1', code: 'abc' })

      expect(result).toEqual({ status: 'invalid' })
      expect(coll.docs[0].attempts).toBe(1)
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
    /** Drives uid-1 to the verified state, returns the collection */
    async function verified() {
      const coll = build()
      const code = await request('uid-1')
      await verifyOtp({ uid: 'uid-1', code })
      return coll
    }

    it('creates the account from the stored email and consumes the record', async () => {
      const coll = await verified()
      jest
        .mocked(createAccount)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-9' }))

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(createAccount).toHaveBeenCalledWith({
        email: 'a@b.com',
        phone: '+447911123456'
      })
      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-9' })
      expect(coll.docs[0].consumed).toBe(true)
    })

    it('rejects an invalid phone without consuming the record', async () => {
      const coll = await verified()

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '020 7946 0000'
      })

      expect(result).toEqual({ status: 'invalid-phone' })
      expect(coll.docs[0].consumed).toBe(false)
    })

    it('rejects completion without a verified record (out-of-order call)', async () => {
      build()
      await request('uid-1')

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(createAccount).not.toHaveBeenCalled()
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
        .mocked(createAccount)
        .mockResolvedValue(/** @type {never} */ ({ _id: 'acc-9' }))
      await completeSignup({ uid: 'uid-1', phone: '07911 123456' })

      const result = await completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(createAccount).toHaveBeenCalledTimes(1)
    })
  })
})
