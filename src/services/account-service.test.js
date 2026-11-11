// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'

import { publishEvent } from '~/src/messaging/publish-base.js'
import { client } from '~/src/mongo.js'
import {
  findByEmail,
  findById,
  isDuplicateKeyError,
  update as updateAccount
} from '~/src/repositories/accounts-repository.js'
import { clear } from '~/src/repositories/otp-lockouts-repository.js'
import { findOne, update } from '~/src/repositories/otps-repository.js'
import {
  deleteAccount,
  recordSignOut,
  updateEmail,
  updatePhone
} from '~/src/services/account-service.js'
import { createTransactionSession } from '~/test/helpers/transaction-session.js'

jest.mock('~/src/repositories/accounts-repository.js', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  isDuplicateKeyError: jest.fn(),
  update: jest.fn()
}))
jest.mock('~/src/repositories/otps-repository.js')
jest.mock('~/src/repositories/otp-lockouts-repository.js')
jest.mock('~/src/mongo.js', () => ({
  client: { startSession: jest.fn() }
}))
jest.mock('@defra/cdp-auditing')
jest.mock('~/src/messaging/publish-base.js')

describe('account service', () => {
  const uid = 'uid-1'
  const id = 'acc-id'
  const email = 'new-email@test.com'
  const validOtp = {
    consumed: false,
    verified: true,
    accountId: id,
    target: email
  }

  /** @type {ReturnType<typeof createTransactionSession>} */
  let session

  beforeEach(() => {
    session = createTransactionSession()
    jest
      .mocked(client.startSession)
      .mockReturnValue(/** @type {never} */ (session))
  })

  it('should throw when account not found', async () => {
    jest.mocked(findById).mockResolvedValueOnce(null)
    jest
      .mocked(findOne)
      // @ts-expect-error - partial mock of test data
      .mockResolvedValueOnce(validOtp)
      // @ts-expect-error - partial mock of test data
      .mockResolvedValueOnce(validOtp)
    const res = await updateEmail(uid, id)
    expect(res).toEqual({ status: 'invalid' })
  })

  describe('updateEmail', () => {
    it('should return invalid when email OTP not found', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
      jest.mocked(update).mockResolvedValueOnce(false)
      const res = await updateEmail(uid, id)
      expect(res).toEqual({ status: 'invalid' })
    })

    it('should return invalid when phone OTP not found', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
      jest.mocked(update).mockResolvedValueOnce(false)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updateEmail(uid, id)
      expect(res).toEqual({ status: 'invalid' })
    })

    it('should return invalid when account not found', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce()
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updateEmail(uid, id)
      expect(res).toEqual({ status: 'invalid' })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return same-as-current when email same as current', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'new-email@test.com'
      })
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updateEmail(uid, id)
      expect(res).toEqual({ status: 'same-as-current' })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return already-in-use when email already exists', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com'
      })
      const duplicateKeyError = new Error('Duplicate key')
      // @ts-expect-error - MongoDB adds this property to duplicate-key errors
      duplicateKeyError.code = 11000
      jest.mocked(updateAccount).mockRejectedValueOnce(duplicateKeyError)
      jest.mocked(isDuplicateKeyError).mockReturnValueOnce(true)
      // @ts-expect-error - partial mock of test data
      jest.mocked(findByEmail).mockResolvedValueOnce({ email })
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updateEmail(uid, id)
      expect(res).toEqual({ status: 'already-in-use' })
      expect(updateAccount).toHaveBeenCalledTimes(1)
      expect(updateAccount).toHaveBeenCalledWith(
        'acc-id',
        {
          email: 'new-email@test.com',
          updatedAt: expect.any(Date)
        },
        session
      )
      expect(update).not.toHaveBeenCalled()
      expect(findByEmail).toHaveBeenCalledWith(email)
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return valid when successful', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        _id: 'acc-id'
      })
      jest
        .mocked(update)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updateEmail(uid, id)
      expect(res).toEqual({ status: 'valid' })
      expect(session.withTransaction).toHaveBeenCalledTimes(1)
      expect(session.endSession).toHaveBeenCalledTimes(1)
      expect(findOne).toHaveBeenCalledTimes(2)
      expect(findOne).toHaveBeenNthCalledWith(1, expect.anything(), session)
      expect(findOne).toHaveBeenNthCalledWith(2, expect.anything(), session)
      expect(findById).toHaveBeenCalledWith(id, session)
      expect(updateAccount).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ email: 'new-email@test.com' }),
        session
      )
      expect(update).toHaveBeenCalledTimes(2)
      expect(update).toHaveBeenNthCalledWith(
        1,
        {
          accountId: 'acc-id',
          consumed: false,
          purpose: 'ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL',
          uid: 'uid-1',
          verified: true
        },
        { consumed: true },
        session
      )
      expect(update).toHaveBeenNthCalledWith(
        2,
        {
          accountId: 'acc-id',
          consumed: false,
          purpose: 'ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE',
          uid: 'uid-1',
          verified: true
        },
        { consumed: true },
        session
      )
      expect(clear).toHaveBeenCalledTimes(2)
      expect(clear).toHaveBeenCalledWith({ target: email }, session)
      expect(audit).toHaveBeenCalledTimes(1)
      expect(audit).toHaveBeenCalledWith({
        event: 'EmailChanged',
        accountId: 'acc-id',
        email: 'new-email@test.com',
        newEmail: 'new-email@test.com',
        oldEmail: 'current-email@test.com'
      })
    })

    it('should roll everything back, without auditing, when the second OTP was already spent', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        _id: 'acc-id'
      })
      jest
        .mocked(update)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)

      const res = await updateEmail(uid, id)

      expect(res).toEqual({ status: 'invalid' })
      expect(clear).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
      expect(session.endSession).toHaveBeenCalledTimes(1)
    })

    it('should not audit, and should throw, when a write in the transaction fails', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        _id: 'acc-id'
      })
      jest.mocked(update).mockResolvedValue(true)
      const error = new Error('clear failed')
      jest.mocked(clear).mockRejectedValueOnce(error)
      jest.mocked(isDuplicateKeyError).mockReturnValue(false)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)

      await expect(updateEmail(uid, id)).rejects.toBe(error)

      expect(audit).not.toHaveBeenCalled()
      expect(session.endSession).toHaveBeenCalledTimes(1)
    })

    it('should roll back the email change and OTP consumption when publishing the audit event fails', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        _id: 'acc-id'
      })
      /** @type {string | undefined} */
      let committedEmail
      jest.mocked(updateAccount).mockImplementation((_id, fields) => {
        committedEmail = /** @type {{ email?: string }} */ (fields).email
        return Promise.resolve(
          /** @type {never} */ ({ matchedCount: 1, modifiedCount: 1 })
        )
      })
      jest.mocked(update).mockResolvedValue(true)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const error = new Error('SNS is down')
      jest.mocked(publishEvent).mockImplementation(() => {
        // the database rolls the whole transaction back, including the
        // account update that ran earlier in the same callback
        committedEmail = undefined
        return Promise.reject(error)
      })

      await expect(updateEmail(uid, id)).rejects.toBe(error)

      expect(committedEmail).toBeUndefined()
      expect(session.endSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('updatePhone', () => {
    const newPhone = '+447500123456'
    it('should return invalid when email OTP not found', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
      jest.mocked(update).mockResolvedValueOnce(false)
      const res = await updatePhone(uid, id, newPhone)
      expect(res).toEqual({ status: 'invalid' })
    })

    it('should return invalid when account not found', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce()
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updatePhone(uid, id, newPhone)
      expect(res).toEqual({ status: 'invalid' })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return same-as-current when new phone same as current', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        phone: newPhone
      })
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({
          ...validOtp,
          target: newPhone
        })
      const res = await updatePhone(uid, id, newPhone)
      expect(res).toEqual({ status: 'same-as-current' })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return invalid-phone when new phone is wrong format', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        phone: '+4407500111111'
      })
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({
          ...validOtp,
          target: newPhone
        })
      const res = await updatePhone(uid, id, 'bad-format')
      expect(res).toEqual({ status: 'invalid-phone' })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return valid when successful', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        phone: '+447500111111',
        _id: 'acc-id'
      })
      jest
        .mocked(update)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updatePhone(uid, id, newPhone)
      expect(res).toEqual({ status: 'valid' })
      expect(update).toHaveBeenCalledTimes(1)
      expect(update).toHaveBeenCalledWith(
        {
          accountId: 'acc-id',
          consumed: false,
          purpose: 'ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL',
          uid: 'uid-1',
          verified: true
        },
        { consumed: true },
        session
      )
      expect(updateAccount).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ phone: '+447500123456' }),
        session
      )
      expect(clear).toHaveBeenCalledWith({ target: email }, session)
      expect(session.withTransaction).toHaveBeenCalledTimes(1)
      expect(audit).toHaveBeenCalledTimes(1)
      expect(audit).toHaveBeenCalledWith({
        event: 'PhoneChanged',
        accountId: 'acc-id',
        email: 'current-email@test.com',
        newPhone: '+447500123456',
        oldPhone: '+447500111111'
      })
    })

    it('should save an Ofcom fictional number for a test account', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'perf-1@example.forms.defra.gov.uk',
        phone: '+447700900001',
        _id: 'acc-id'
      })
      jest.mocked(update).mockResolvedValueOnce(true)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updatePhone(uid, id, '07700900000')
      expect(res).toEqual({ status: 'valid' })
      expect(updateAccount).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ phone: '+447700900000' }),
        session
      )
    })

    it('should roll back the phone change and OTP consumption when publishing the audit event fails', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        phone: '+447500111111',
        _id: 'acc-id'
      })
      /** @type {string | undefined} */
      let committedPhone
      jest.mocked(updateAccount).mockImplementation((_id, fields) => {
        committedPhone = /** @type {{ phone?: string }} */ (fields).phone
        return Promise.resolve(
          /** @type {never} */ ({ matchedCount: 1, modifiedCount: 1 })
        )
      })
      jest.mocked(update).mockResolvedValueOnce(true)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const error = new Error('SNS is down')
      jest.mocked(publishEvent).mockImplementation(() => {
        // the database rolls the whole transaction back, including the
        // account update that ran earlier in the same callback
        committedPhone = undefined
        return Promise.reject(error)
      })

      await expect(updatePhone(uid, id, newPhone)).rejects.toBe(error)

      expect(committedPhone).toBeUndefined()
      expect(session.endSession).toHaveBeenCalledTimes(1)
    })

    it('should roll back, without auditing, when the OTP was already spent', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        phone: '+447500111111',
        _id: 'acc-id'
      })
      jest.mocked(update).mockResolvedValueOnce(false)
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)

      const res = await updatePhone(uid, id, newPhone)

      expect(res).toEqual({ status: 'invalid' })
      expect(clear).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return invalid-phone for an Ofcom fictional number on a normal account', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com',
        phone: '+447500111111'
      })
      jest
        .mocked(findOne)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce(validOtp)
      const res = await updatePhone(uid, id, '07700900000')
      expect(res).toEqual({ status: 'invalid-phone' })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })
  })

  describe('delete account', () => {
    const deleteOtp = {
      ...validOtp,
      purpose: 'ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL'
    }

    it('should return invalid when the verified email OTP is not found', async () => {
      jest.mocked(findOne).mockResolvedValueOnce(null)

      await expect(deleteAccount(uid, id)).resolves.toEqual({
        status: 'invalid'
      })
      expect(updateAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should throw Boom.notFound when account not found', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findOne).mockResolvedValueOnce(deleteOtp)
      jest
        .mocked(updateAccount)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })

      await expect(deleteAccount(uid, id)).rejects.toThrow(
        Boom.notFound(`Account ${id} not found`)
      )
      expect(findOne).toHaveBeenCalledWith(
        {
          uid,
          purpose: 'ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL',
          verified: true,
          consumed: false,
          accountId: id
        },
        session
      )
      expect(session.endSession).toHaveBeenCalledTimes(1)
      expect(clear).not.toHaveBeenCalled()
      expect(audit).not.toHaveBeenCalled()
    })

    it('should throw Boom.badRequest when account found but not updated', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findOne).mockResolvedValueOnce(deleteOtp)
      jest
        .mocked(updateAccount)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 0 })

      await expect(deleteAccount(uid, id)).rejects.toThrow(
        Boom.badRequest(`Account ${id} could not be deleted`)
      )
    })

    it('should mark the account deleted, consume the OTP and audit the deletion', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findOne).mockResolvedValueOnce(deleteOtp)
      jest
        .mocked(updateAccount)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      jest.mocked(update).mockResolvedValueOnce(true)

      await expect(deleteAccount(uid, id)).resolves.toEqual({ status: 'valid' })

      expect(updateAccount).toHaveBeenCalledWith(
        id,
        {
          status: 'deleted',
          updatedAt: expect.any(Date)
        },
        session
      )
      expect(update).toHaveBeenCalledWith(
        {
          uid,
          purpose: 'ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL',
          verified: true,
          consumed: false,
          accountId: id
        },
        { consumed: true },
        session
      )
      expect(clear).toHaveBeenCalledWith({ target: email }, session)
      expect(audit).toHaveBeenCalledWith({
        event: 'AccountDeleted',
        accountId: id,
        email
      })
    })

    it('should roll back the account deletion and OTP consumption when publishing the audit event fails', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findOne).mockResolvedValueOnce(deleteOtp)
      /** @type {string | undefined} */
      let committedStatus
      jest.mocked(updateAccount).mockImplementation((_id, fields) => {
        committedStatus = /** @type {{ status?: string }} */ (fields).status
        return Promise.resolve(
          /** @type {never} */ ({ matchedCount: 1, modifiedCount: 1 })
        )
      })
      jest.mocked(update).mockResolvedValueOnce(true)
      const error = new Error('SNS is down')
      jest.mocked(publishEvent).mockImplementation(() => {
        // the database rolls the whole transaction back, including the
        // account update that ran earlier in the same callback
        committedStatus = undefined
        return Promise.reject(error)
      })

      await expect(deleteAccount(uid, id)).rejects.toBe(error)

      expect(committedStatus).toBeUndefined()
      expect(session.endSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('recordSignOut', () => {
    it('audits a sign-out for the account', async () => {
      jest
        .mocked(findById)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ _id: id, email })

      await recordSignOut(id)

      expect(audit).toHaveBeenCalledWith({
        event: 'SignOut',
        accountId: id,
        email
      })
    })

    it('throws not found, without auditing, when the account is unknown', async () => {
      jest.mocked(findById).mockResolvedValueOnce(null)

      await expect(recordSignOut(id)).rejects.toThrow(`Account ${id} not found`)
      expect(audit).not.toHaveBeenCalled()
    })
  })
})
