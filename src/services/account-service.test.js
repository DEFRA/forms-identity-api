// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'

import {
  findById,
  update as updateAccount
} from '~/src/repositories/accounts-repository.js'
import { findOne, update } from '~/src/repositories/otps-repository.js'
import { deleteAccount, updateEmail } from '~/src/services/account-service.js'

jest.mock('~/src/repositories/accounts-repository.js')
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

  it('should return valid when successful', async () => {
    // @ts-expect-error - partial mock of test data
    jest.mocked(findById).mockResolvedValueOnce({
      status: 'active',
      email: 'current-email@test.com'
    })
    jest.mocked(update).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
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
        purpose: 'ACCOUNT_VERIFY_EMAIL',
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
        purpose: 'ACCOUNT_VERIFY_PHONE',
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

  describe('delete account', () => {
    it('should throw Boom.notFound when account not found', async () => {
      jest
        .mocked(updateAccount)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })

      await expect(deleteAccount(id)).rejects.toThrow(
        Boom.notFound(`Account ${id} not found`)
      )
    })

    it('should throw Boom.badRequest when account found but not updated', async () => {
      jest
        .mocked(updateAccount)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 0 })

      await expect(deleteAccount(id)).rejects.toThrow(
        Boom.badRequest(`Account ${id} could not be deleted`)
      )
    })

    it('should not throw if successful', async () => {
      jest
        .mocked(updateAccount)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })

      await expect(deleteAccount(id)).resolves.toBeUndefined()
    })
  })
})
