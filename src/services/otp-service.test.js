// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'
import argon2 from 'argon2'

import { PURPOSE, TRANSPORT } from '~/src/constants.js'
import { sendEmail, sendSms } from '~/src/lib/notify.js'
import { findById } from '~/src/repositories/accounts-repository.js'
import { findOne, update } from '~/src/repositories/otps-repository.js'
import { requestOtp, verifyOtp } from '~/src/services/otp-service.js'

jest.mock('~/src/repositories/accounts-repository.js')
jest.mock('~/src/repositories/otps-repository.js')
jest.mock('~/src/lib/notify.js')
jest.mock('@defra/cdp-auditing')
jest.mock('argon2')

describe('otp-service', () => {
  const uid = 'uid-1'
  const email = 'test-email@test.com'
  const accountId = 'acc-id'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('requestOtp', () => {
    it('should throw if no account for purpose of ACCOUNT_', async () => {
      jest.mocked(findById).mockResolvedValueOnce(null)
      await expect(
        requestOtp(
          uid,
          email,
          TRANSPORT.EMAIL,
          PURPOSE.ACCOUNT_VERIFY_EMAIL,
          accountId
        )
      ).rejects.toThrow('Bad Request')
    })

    it('should throw if no resulting target', async () => {
      // @ts-expect-error - partial mock of test data
      jest.mocked(findById).mockResolvedValueOnce({ phone: '+447507123456' })
      await expect(
        requestOtp(
          uid,
          '',
          TRANSPORT.EMAIL,
          PURPOSE.ACCOUNT_VERIFY_EMAIL,
          accountId
        )
      ).rejects.toThrow('Bad Request')
    })

    it('should create OTP for email', async () => {
      await requestOtp(
        uid,
        'test-email@test.com',
        TRANSPORT.EMAIL,
        PURPOSE.ACCOUNT_VERIFY_EMAIL,
        undefined
      )
      expect(sendEmail).toHaveBeenCalledWith(
        'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
        'test-email@test.com',
        { code: expect.any(String), expiry_minutes: 15 }
      )
      expect(audit).toHaveBeenCalledWith({
        event: 'OtpIssued',
        email: 'test-email@test.com',
        uid: 'uid-1'
      })
    })

    it('should create OTP for phone', async () => {
      jest
        .mocked(findById)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({
          phone: '+447507123456',
          email: 'test-email@test.com'
        })
      await requestOtp(
        uid,
        '',
        TRANSPORT.SMS,
        PURPOSE.ACCOUNT_VERIFY_PHONE,
        accountId
      )
      expect(sendSms).toHaveBeenCalledWith(
        'ssssssss-ssss-ssss-ssss-ssssssssssss',
        '+447507123456',
        { code: expect.any(String), expiry_minutes: 15 }
      )
      expect(audit).toHaveBeenCalledWith({
        event: 'OtpIssued',
        email: 'test-email@test.com',
        phone: '+447507123456',
        uid: 'uid-1'
      })
    })
  })

  describe('verifyOtp', () => {
    it('should add account_id to filter', async () => {
      const res = await verifyOtp(
        uid,
        '123456',
        PURPOSE.ACCOUNT_VERIFY_EMAIL,
        accountId
      )
      expect(res).toEqual({ status: 'invalid-code-consumed-or-expired' })
      expect(findOne).toHaveBeenCalledWith({
        accountId: 'acc-id',
        consumed: false,
        purpose: 'ACCOUNT_VERIFY_EMAIL',
        uid: 'uid-1',
        verified: false
      })
    })

    it('should not add account_id to filter if SIGNIN', async () => {
      const res = await verifyOtp(
        uid,
        '123456',
        PURPOSE.SIGNIN_VERIFY_EMAIL,
        accountId
      )
      expect(res).toEqual({ status: 'invalid-code-consumed-or-expired' })
      expect(findOne).toHaveBeenCalledWith({
        consumed: false,
        purpose: 'SIGNIN_VERIFY_EMAIL',
        uid: 'uid-1',
        verified: false
      })
    })

    it('should verify only, not consume', async () => {
      const createdAt = new Date()
      const expireAt = new Date(createdAt.getTime() + 15 * 60 * 1000)
      jest.mocked(findOne).mockResolvedValueOnce(
        // @ts-expect-error - partial mock of test data
        {
          uid,
          target: '+441911234567',
          accountId,
          createdAt,
          expireAt,
          attempts: 0
        }
      )
      jest.mocked(findById).mockResolvedValueOnce(
        // @ts-expect-error - partial mock of test data
        {
          phone: '+441911234567',
          email: 'test-email@test.com'
        }
      )
      jest.mocked(update).mockResolvedValueOnce(true)
      jest.mocked(argon2.verify).mockResolvedValueOnce(true)
      const res = await verifyOtp(
        uid,
        '123456',
        PURPOSE.ACCOUNT_VERIFY_PHONE,
        accountId
      )
      expect(res).toEqual({ status: 'valid' })
    })
  })
})
