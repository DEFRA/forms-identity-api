// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'

import {
  findByEmail,
  findById,
  isDuplicateKeyError,
  update as updateAccount
} from '~/src/repositories/accounts-repository.js'
import { findOne, update } from '~/src/repositories/otps-repository.js'
import {
  deleteAccount,
  updateEmail,
  updatePhone
} from '~/src/services/account-service.js'

jest.mock('~/src/repositories/accounts-repository.js', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  isDuplicateKeyError: jest.fn(),
  update: jest.fn()
}))
jest.mock('~/src/repositories/otps-repository.js')
jest.mock('@defra/cdp-auditing')

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
      expect(updateAccount).toHaveBeenCalledWith('acc-id', {
        email: 'new-email@test.com',
        updatedAt: expect.any(Date)
      })
      expect(update).not.toHaveBeenCalled()
      expect(findByEmail).toHaveBeenCalledWith(email)
      expect(audit).not.toHaveBeenCalled()
    })

    it('should return valid when successful', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({
        status: 'active',
        email: 'current-email@test.com'
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
        { consumed: true }
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
        { consumed: true }
      )
      expect(audit).toHaveBeenCalledTimes(1)
      expect(audit).toHaveBeenCalledWith({
        event: 'EmailChanged',
        accountId: undefined,
        email: 'new-email@test.com',
        newEmail: 'new-email@test.com',
        oldEmail: 'current-email@test.com'
      })
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
        phone: '+447500111111'
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
        { consumed: true }
      )
      expect(audit).toHaveBeenCalledTimes(1)
      expect(audit).toHaveBeenCalledWith({
        event: 'PhoneChanged',
        accountId: undefined,
        email: 'current-email@test.com',
        newPhone: '+447500123456',
        oldPhone: '+447500111111'
      })
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
      expect(findOne).toHaveBeenCalledWith({
        uid,
        purpose: 'ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL',
        verified: true,
        consumed: false,
        accountId: id
      })
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

      expect(updateAccount).toHaveBeenCalledWith(id, {
        status: 'deleted',
        updatedAt: expect.any(Date)
      })
      expect(update).toHaveBeenCalledWith(
        {
          uid,
          purpose: 'ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL',
          verified: true,
          consumed: false,
          accountId: id
        },
        { consumed: true }
      )
      expect(audit).toHaveBeenCalledWith({
        event: 'AccountDeleted',
        accountId: id,
        email
      })
    })
  })
})
