import argon2 from 'argon2'

import {
  SIGNIN_VERIFY_EMAIL,
  makeOtpService
} from '~/src/signin/otp-service.js'

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

/**
 * @typedef {ReturnType<typeof build>} Built
 */

/** Builds the service plus captive fakes */
function build() {
  const coll = memoryColl()
  const db = /** @type {import('mongodb').Db} */ (
    /** @type {unknown} */ ({ collection: () => coll })
  )
  const notifier = { sendOtp: jest.fn().mockResolvedValue(undefined) }
  const accounts = /** @type {any} */ ({
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    createAccount: jest.fn()
  })
  const service = makeOtpService(db, notifier, accounts)
  return { coll, notifier, accounts, service }
}

describe('otp service', () => {
  describe('requestOtp', () => {
    it('stores an argon2 hash keyed by {uid, purpose} and sends the code', async () => {
      const { coll, notifier, service } = build()

      await service.requestOtp({ uid: 'uid-1', email: 'A@B.com' })

      expect(notifier.sendOtp).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^\d{6}$/)
      )
      const code = /** @type {string} */ (notifier.sendOtp.mock.calls[0][1])
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
    /**
     * Requests a code and returns it
     * @param {Built} built
     * @param {string} uid
     */
    async function request(built, uid, email = 'a@b.com') {
      await built.service.requestOtp({ uid, email })
      return /** @type {string} */ (
        built.notifier.sendOtp.mock.calls.at(-1)?.[1]
      )
    }

    it('signs in immediately when an account exists', async () => {
      const built = build()
      built.accounts.findByEmail.mockResolvedValue({ _id: 'acc-1' })
      const code = await request(built, 'uid-1')

      const result = await built.service.verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-1' })
      expect(built.coll.docs[0].consumed).toBe(true)
    })

    it('requires the phone step when no account exists', async () => {
      const built = build()
      const code = await request(built, 'uid-1')

      const result = await built.service.verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'phone-required' })
      expect(built.coll.docs[0].verified).toBe(true)
      expect(built.coll.docs[0].consumed).toBe(false)
    })

    it('rejects a code minted for another interaction and burns the local attempt', async () => {
      const built = build()
      const codeA = await request(built, 'uid-a')
      await request(built, 'uid-b')

      const result = await built.service.verifyOtp({
        uid: 'uid-b',
        code: codeA
      })

      expect(result).toEqual({ status: 'invalid' })
      const docB = built.coll.docs.find((d) => d.uid === 'uid-b')
      const docA = built.coll.docs.find((d) => d.uid === 'uid-a')
      expect(docB?.attempts).toBe(1)
      expect(docA?.attempts).toBe(0)
    })

    it('never matches a record of a different purpose on the same uid', async () => {
      const built = build()
      const code = await request(built, 'uid-1')
      // seed a future SMS/recovery record sharing the uid
      built.coll.docs.push({
        _id: 99,
        uid: 'uid-1',
        purpose: 'RECOVERY_VERIFY_PHONE',
        target: '+447911123456',
        codeHash: built.coll.docs[0].codeHash,
        attempts: 0,
        verified: false,
        consumed: false,
        expireAt: new Date(Date.now() + 60_000)
      })

      const result = await built.service.verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'phone-required' })
      const recovery = built.coll.docs.find(
        (d) => d.purpose === 'RECOVERY_VERIFY_PHONE'
      )
      expect(recovery?.verified).toBe(false)
      expect(recovery?.consumed).toBe(false)
    })

    it('reports expiry distinctly', async () => {
      const built = build()
      const code = await request(built, 'uid-1')
      built.coll.docs[0].expireAt = new Date(Date.now() - 1000)

      const result = await built.service.verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'expired' })
    })

    it('burns the record after 5 wrong attempts, then rejects the right code', async () => {
      const built = build()
      const code = await request(built, 'uid-1')

      for (let i = 0; i < 5; i++) {
        await built.service.verifyOtp({ uid: 'uid-1', code: '000001' })
      }
      const result = await built.service.verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
      expect(built.coll.docs[0].consumed).toBe(true)
    })

    it('rejects malformed codes without argon2 work but burns an attempt', async () => {
      const built = build()
      await request(built, 'uid-1')

      const result = await built.service.verifyOtp({
        uid: 'uid-1',
        code: 'abc'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(built.coll.docs[0].attempts).toBe(1)
    })

    it('rejects re-verification once verified (one-way state machine)', async () => {
      const built = build()
      const code = await request(built, 'uid-1')
      await built.service.verifyOtp({ uid: 'uid-1', code })

      const result = await built.service.verifyOtp({ uid: 'uid-1', code })

      expect(result).toEqual({ status: 'invalid' })
    })
  })

  describe('completeSignup', () => {
    /** Drives a uid to the verified state and returns the built context */
    async function verified() {
      const built = build()
      await built.service.requestOtp({ uid: 'uid-1', email: 'a@b.com' })
      const code = /** @type {string} */ (
        built.notifier.sendOtp.mock.calls.at(-1)?.[1]
      )
      await built.service.verifyOtp({ uid: 'uid-1', code })
      return built
    }

    it('creates the account from the stored email and consumes the record', async () => {
      const built = await verified()
      built.accounts.createAccount.mockResolvedValue({ _id: 'acc-9' })

      const result = await built.service.completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(built.accounts.createAccount).toHaveBeenCalledWith({
        email: 'a@b.com',
        phone: '+447911123456'
      })
      expect(result).toEqual({ status: 'signed-in', accountId: 'acc-9' })
      expect(built.coll.docs[0].consumed).toBe(true)
    })

    it('rejects an invalid phone without consuming the record', async () => {
      const built = await verified()

      const result = await built.service.completeSignup({
        uid: 'uid-1',
        phone: '020 7946 0000'
      })

      expect(result).toEqual({ status: 'invalid-phone' })
      expect(built.coll.docs[0].consumed).toBe(false)
    })

    it('rejects completion without a verified record (out-of-order call)', async () => {
      const built = build()
      await built.service.requestOtp({ uid: 'uid-1', email: 'a@b.com' })

      const result = await built.service.completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(built.accounts.createAccount).not.toHaveBeenCalled()
    })

    it('rejects completion for a different uid', async () => {
      const built = await verified()

      const result = await built.service.completeSignup({
        uid: 'uid-other',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
    })

    it('rejects a second completion (consumed)', async () => {
      const built = await verified()
      built.accounts.createAccount.mockResolvedValue({ _id: 'acc-9' })
      await built.service.completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      const result = await built.service.completeSignup({
        uid: 'uid-1',
        phone: '07911 123456'
      })

      expect(result).toEqual({ status: 'invalid' })
      expect(built.accounts.createAccount).toHaveBeenCalledTimes(1)
    })
  })
})
