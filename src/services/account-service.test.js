import { findById } from '~/src/repositories/accounts-repository.js'
import { findOne, update } from '~/src/repositories/otps-repository.js'
import { updateEmail } from '~/src/services/account-service.js'

jest.mock('~/src/repositories/accounts-repository.js')
jest.mock('~/src/repositories/otps-repository.js')

describe('account service', () => {
  const uid = 'uid-1'
  const id = 'acc-id'
  const email = 'new-email@test.com'
  const phone = '+447507123456'

  it('should throw when account not found', async () => {
    jest.mocked(findById).mockResolvedValueOnce(null)
    const res = await updateEmail(uid, id)
    expect(res).toEqual({ status: 'invalid' })
  })

  it('should return invalid when OTP not found', async () => {
    // @ts-expect-error - partial mock of test data
    jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
    jest.mocked(update).mockResolvedValueOnce(false)
    const res = await updateEmail(uid, id)
    expect(res).toEqual({ status: 'invalid' })
  })

  it('should return valid when successful', async () => {
    // @ts-expect-error - partial mock of test data
    jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
    jest.mocked(update).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    jest
      .mocked(findOne)
      // @ts-expect-error - partial mock of test data
      .mockResolvedValueOnce({
        consumed: false,
        verified: true,
        accountId: id,
        target: email
      })
      // @ts-expect-error - partial mock of test data
      .mockResolvedValueOnce({
        consumed: false,
        verified: true,
        accountId: id,
        target: phone
      })
    const res = await updateEmail(uid, id)
    expect(res).toEqual({ status: 'valid' })
  })
})
