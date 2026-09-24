import { PURPOSE, TRANSPORT } from '~/src/constants.js'
import { findById } from '~/src/repositories/accounts-repository.js'
import { findOne } from '~/src/repositories/otps-repository.js'
import { requestOtp, verifyOtp } from '~/src/services/otp-service.js'

jest.mock('~/src/repositories/accounts-repository.js')
jest.mock('~/src/repositories/otps-repository.js')

describe('otp-service', () => {
  const uid = 'uid-1'
  const email = 'test-email@test.com'
  const accountId = 'acc-id'
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
  })
})
