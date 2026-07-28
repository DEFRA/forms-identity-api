import argon2 from 'argon2'

import { buildMockCollection, buildMockDb } from '~/src/__stubs__/mongo.js'
import { makeOtpService } from '~/src/otp/otp-service.js'

jest.mock('~/src/mongo.js')

describe('otp service', () => {
  /** @type {ReturnType<typeof buildMockCollection>} */
  let coll
  /** @type {{ sendOtp: jest.Mock }} */
  let notifier
  /** @type {{ upsertUserByEmail: jest.Mock }} */
  let userService
  /** @type {ReturnType<typeof makeOtpService>} */
  let otp

  // Fake delivery seam: records what would have been sent, and lets each test
  // read the generated code (which requestOtp otherwise only ever hashes).
  // The real code path is identical in every environment; only this test
  // double differs.
  /**
   * Reads the most recently "sent" code off the notifier fake
   */
  function lastSentCode() {
    const calls = notifier.sendOtp.mock.calls
    return /** @type {string} */ (calls[calls.length - 1][1])
  }

  /**
   * Builds a stored otp_code document as requestOtp would have written it
   * @param {string} code
   * @param {Partial<{ email: string, expireAt: Date, consumed: boolean, attempts: number }>} [overrides]
   */
  async function buildStoredDoc(code, overrides = {}) {
    return {
      _id: 'u1',
      email: 'a@b.com',
      hash: await argon2.hash(code),
      expireAt: new Date(Date.now() + 900_000),
      consumed: false,
      attempts: 0,
      ...overrides
    }
  }

  beforeEach(() => {
    coll = buildMockCollection()
    notifier = { sendOtp: jest.fn().mockResolvedValue(undefined) }
    userService = {
      upsertUserByEmail: jest
        .fn()
        .mockResolvedValue({ _id: 'user-1', email: 'a@b.com' })
    }
    otp = makeOtpService(buildMockDb(coll), notifier, userService)
  })

  describe('requestOtp', () => {
    it('sends a 6-digit code via the notifier and stores only its hash (never plaintext)', async () => {
      await otp.requestOtp({ uid: 'u1', email: 'a@b.com' })

      const code = lastSentCode()
      expect(code).toMatch(/^\d{6}$/)
      expect(notifier.sendOtp).toHaveBeenCalledWith('a@b.com', code)

      expect(coll.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        {
          $set: {
            email: 'a@b.com',
            hash: expect.any(String),
            expireAt: expect.any(Date),
            consumed: false,
            attempts: 0
          }
        },
        { upsert: true }
      )

      const update = /** @type {{ $set: { hash: string, expireAt: Date } }} */ (
        coll.updateOne.mock.calls[0][1]
      )
      expect(update.$set.hash).not.toContain(code) // hashed, not plaintext
      await expect(argon2.verify(update.$set.hash, code)).resolves.toBe(true)
    })

    it('sets the expiry from the configured TTL (default 900s)', async () => {
      const before = Date.now()
      await otp.requestOtp({ uid: 'u1', email: 'a@b.com' })

      const update = /** @type {{ $set: { expireAt: Date } }} */ (
        coll.updateOne.mock.calls[0][1]
      )
      const expireAt = update.$set.expireAt.getTime()
      expect(expireAt).toBeGreaterThanOrEqual(before + 900_000)
      expect(expireAt).toBeLessThanOrEqual(Date.now() + 900_000)
    })
  })

  describe('verifyOtp', () => {
    it('verifies a valid code, marks it consumed and returns the opaque account id from the users collection', async () => {
      const doc = await buildStoredDoc('123456')
      coll.findOne.mockResolvedValue(doc)

      const result = await otp.verifyOtp({
        uid: 'u1',
        email: 'a@b.com',
        code: '123456'
      })

      // accountId is the opaque user id minted for the STORED record's email —
      // the completion route never has to trust anything off the wire.
      expect(result).toEqual({ ok: true, accountId: 'user-1' })
      expect(userService.upsertUserByEmail).toHaveBeenCalledWith(doc.email)
      expect(coll.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { consumed: true } }
      )
    })

    it('rejects a consumed code (single-use)', async () => {
      coll.findOne.mockResolvedValue(
        await buildStoredDoc('123456', { consumed: true })
      )

      expect(
        await otp.verifyOtp({ uid: 'u1', email: 'a@b.com', code: '123456' })
      ).toEqual({ ok: false })
      expect(userService.upsertUserByEmail).not.toHaveBeenCalled()
    })

    it('rejects a wrong code and counts the attempt', async () => {
      coll.findOne.mockResolvedValue(await buildStoredDoc('123456'))
      coll.findOneAndUpdate.mockResolvedValue(
        await buildStoredDoc('123456', { attempts: 1 })
      )

      expect(
        await otp.verifyOtp({ uid: 'u1', email: 'a@b.com', code: '000000' })
      ).toEqual({ ok: false })
      expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
      )
      // below the attempt cap the code is not burned
      expect(coll.updateOne).not.toHaveBeenCalled()
      expect(userService.upsertUserByEmail).not.toHaveBeenCalled()
    })

    it('burns the code at the attempt cap (default 5)', async () => {
      coll.findOne.mockResolvedValue(await buildStoredDoc('123456'))
      coll.findOneAndUpdate.mockResolvedValue(
        await buildStoredDoc('123456', { attempts: 5 })
      )

      expect(
        await otp.verifyOtp({ uid: 'u1', email: 'a@b.com', code: '000000' })
      ).toEqual({ ok: false })
      expect(coll.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { consumed: true } }
      )
    })

    it('rejects verification when no code was ever requested', async () => {
      coll.findOne.mockResolvedValue(null)

      expect(
        await otp.verifyOtp({ uid: 'never', email: 'a@b.com', code: '123456' })
      ).toEqual({ ok: false })
    })

    it('rejects an email that does not match the stored record', async () => {
      coll.findOne.mockResolvedValue(await buildStoredDoc('123456'))

      expect(
        await otp.verifyOtp({ uid: 'u1', email: 'other@b.com', code: '123456' })
      ).toEqual({ ok: false })
      expect(userService.upsertUserByEmail).not.toHaveBeenCalled()
    })

    it('rejects an expired code before any hash check', async () => {
      coll.findOne.mockResolvedValue(
        await buildStoredDoc('123456', {
          expireAt: new Date(Date.now() - 1000)
        })
      )

      expect(
        await otp.verifyOtp({ uid: 'u1', email: 'a@b.com', code: '123456' })
      ).toEqual({ ok: false })
      expect(coll.findOneAndUpdate).not.toHaveBeenCalled()
      expect(userService.upsertUserByEmail).not.toHaveBeenCalled()
    })
  })
})
