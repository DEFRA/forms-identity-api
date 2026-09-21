import { findById } from '~/src/repositories/accounts-repository.js'
import { update } from '~/src/repositories/otps-repository.js'
import { updateEmail } from '~/src/services/account-service.js'

jest.mock('~/src/repositories/accounts-repository.js')
jest.mock('~/src/repositories/otps-repository.js')

describe('account service', () => {
  const uid = 'uid-1'
  const id = 'acc-id'
  const email = 'new-email@test.com'

  it('should throw when account not found', async () => {
    jest.mocked(findById).mockResolvedValueOnce(null)
    await expect(() => updateEmail(uid, id, email)).rejects.toThrow('Not Found')
  })

  it('should return invalid when OTP not found', async () => {
    // @ts-expect-error - partial mock of test data
    jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
    jest.mocked(update).mockResolvedValueOnce(false)
    const res = await updateEmail(uid, id, email)
    expect(res).toEqual({ status: 'invalid' })
  })

  it('should return valid when successful', async () => {
    // @ts-expect-error - partial mock of test data
    jest.mocked(findById).mockResolvedValueOnce({ status: 'active' })
    jest.mocked(update).mockResolvedValueOnce(true)
    const res = await updateEmail(uid, id, email)
    expect(res).toEqual({ status: 'valid' })
  })
})
