// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'
import argon2 from 'argon2'

import { CY, EN_GB, PURPOSE, TRANSPORT } from '~/src/constants.js'
import { sendEmail, sendSms } from '~/src/lib/notify.js'
import { client } from '~/src/mongo.js'
import { findById } from '~/src/repositories/accounts-repository.js'
import {
  findOne as lockoutFindOne,
  incrementRequests
} from '~/src/repositories/otp-lockouts-repository.js'
import { findOne, update } from '~/src/repositories/otps-repository.js'
import { requestOtp, verifyOtp } from '~/src/services/otp-service.js'
import { createTransactionSession } from '~/test/helpers/transaction-session.js'

jest.mock('~/src/repositories/accounts-repository.js')
jest.mock('~/src/repositories/otps-repository.js')
jest.mock('~/src/repositories/otp-lockouts-repository.js')
jest.mock('~/src/lib/notify.js')
jest.mock('~/src/mongo.js', () => ({
  client: { startSession: jest.fn() }
}))
jest.mock('@defra/cdp-auditing')
jest.mock('argon2')

describe('otp-service', () => {
  const uid = 'uid-1'
  const email = 'test-email@test.com'
  const accountId = 'acc-id'

  /** @type {ReturnType<typeof createTransactionSession>} */
  let transactionSession

  beforeEach(() => {
    jest.clearAllMocks()
    transactionSession = createTransactionSession()
    jest
      .mocked(client.startSession)
      .mockReturnValue(/** @type {never} */ (transactionSession))
    jest.mocked(lockoutFindOne).mockResolvedValueOnce(null)
    // @ts-expect-error - partial mock of test data
    jest.mocked(incrementRequests).mockResolvedValueOnce({ requests: 0 })
  })

  describe('requestOtp', () => {
    it('should throw if no account for purpose of ACCOUNT_', async () => {
      jest.mocked(findById).mockResolvedValueOnce(null)
      await expect(
        requestOtp(
          uid,
          email,
          TRANSPORT.EMAIL,
          PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
          { language: EN_GB, accountId }
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
          PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
          { language: EN_GB, accountId }
        )
      ).rejects.toThrow('Bad Request')
    })

    it('should create OTP for email', async () => {
      jest
        .mocked(findById)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({
          phone: '+447507123456',
          email: 'test-email@test.com'
        })
      await requestOtp(
        uid,
        'test-email@test.com',
        TRANSPORT.EMAIL,
        PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
        { language: EN_GB, accountId }
      )
      expect(sendEmail).toHaveBeenCalledWith(
        process.env.NOTIFY_OTP_ENGLISH_TEMPLATE_ID,
        'test-email@test.com',
        {
          code: expect.any(String),
          expiry_minutes: 15,
          service_phrase: '',
          action: 'confirm your new email address'
        }
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
        PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE,
        { language: EN_GB, accountId }
      )
      expect(sendSms).toHaveBeenCalledWith(
        process.env.NOTIFY_OTP_SMS_ENGLISH_TEMPLATE_ID,
        '+447507123456',
        {
          code: expect.any(String),
          expiry_minutes: 15,
          service_phrase: '',
          action: 'change your email address'
        }
      )
      expect(audit).toHaveBeenCalledWith({
        event: 'OtpIssued',
        email: 'test-email@test.com',
        phone: '+447507123456',
        uid: 'uid-1'
      })
    })

    it('should send the English email with the service phrase when a service is named', async () => {
      jest
        .mocked(findById)
        // @ts-expect-error - partial mock of test data
        .mockResolvedValueOnce({ email: 'test-email@test.com' })
      await requestOtp(
        uid,
        'test-email@test.com',
        TRANSPORT.EMAIL,
        PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
        { language: EN_GB, accountId, serviceName: 'Apply for a licence' }
      )
      expect(sendEmail).toHaveBeenCalledWith(
        process.env.NOTIFY_OTP_ENGLISH_TEMPLATE_ID,
        'test-email@test.com',
        {
          code: expect.any(String),
          expiry_minutes: 15,
          service_phrase: "for 'Apply for a licence'",
          action: 'confirm your new email address'
        }
      )
    })

    describe('in Welsh', () => {
      it('should send the Welsh email template with Welsh text', async () => {
        jest
          .mocked(findById)
          // @ts-expect-error - partial mock of test data
          .mockResolvedValueOnce({ email: 'test-email@test.com' })
        await requestOtp(
          uid,
          'test-email@test.com',
          TRANSPORT.EMAIL,
          PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
          { language: CY, accountId }
        )
        expect(sendEmail).toHaveBeenCalledWith(
          process.env.NOTIFY_OTP_WELSH_TEMPLATE_ID,
          'test-email@test.com',
          {
            code: expect.any(String),
            expiry_minutes: 15,
            service_phrase: '',
            action: 'cadarnhau eich cyfeiriad e-bost newydd'
          }
        )
      })

      it('should send the Welsh email with a Welsh service phrase when a service is named', async () => {
        jest
          .mocked(findById)
          // @ts-expect-error - partial mock of test data
          .mockResolvedValueOnce({ email: 'test-email@test.com' })
        await requestOtp(
          uid,
          'test-email@test.com',
          TRANSPORT.EMAIL,
          PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL,
          { language: CY, accountId, serviceName: 'Gwneud cais am drwydded' }
        )
        expect(sendEmail).toHaveBeenCalledWith(
          process.env.NOTIFY_OTP_WELSH_TEMPLATE_ID,
          'test-email@test.com',
          {
            code: expect.any(String),
            expiry_minutes: 15,
            service_phrase: "ar gyfer 'Gwneud cais am drwydded'",
            action: 'dileu eich manylion mewngofnodi'
          }
        )
      })

      it('should send the Welsh SMS template with Welsh text', async () => {
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
          PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE,
          { language: CY, accountId }
        )
        expect(sendSms).toHaveBeenCalledWith(
          process.env.NOTIFY_OTP_SMS_WELSH_TEMPLATE_ID,
          '+447507123456',
          {
            code: expect.any(String),
            expiry_minutes: 15,
            service_phrase: '',
            action: 'newid eich cyfeiriad e-bost'
          }
        )
        expect(sendEmail).not.toHaveBeenCalled()
      })
    })
  })

  describe('verifyOtp', () => {
    it('should add account_id to filter', async () => {
      const res = await verifyOtp(
        uid,
        '123456',
        PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
        accountId
      )
      expect(res).toEqual({ status: 'invalid-code-consumed-or-expired' })
      expect(findOne).toHaveBeenCalledWith(
        {
          accountId: 'acc-id',
          consumed: false,
          purpose: 'ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL',
          uid: 'uid-1',
          verified: false
        },
        transactionSession
      )
    })

    it('should not add account_id to filter if SIGNIN', async () => {
      const res = await verifyOtp(
        uid,
        '123456',
        PURPOSE.SIGNIN_VERIFY_EMAIL,
        accountId
      )
      expect(res).toEqual({ status: 'invalid-code-consumed-or-expired' })
      expect(findOne).toHaveBeenCalledWith(
        {
          consumed: false,
          purpose: 'SIGNIN_VERIFY_EMAIL',
          uid: 'uid-1',
          verified: false
        },
        transactionSession
      )
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
        PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE,
        accountId
      )
      expect(res).toEqual({ status: 'valid' })
    })
  })
})
