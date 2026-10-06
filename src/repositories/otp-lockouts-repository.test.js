import { incrementRequests } from '~/src/repositories/otp-lockouts-repository.js'

const findOneAndUpdate = jest.fn()

jest.mock('~/src/mongo.js', () => ({
  OTP_LOCKOUTS_COLLECTION_NAME: 'otp-lockouts',
  db: { collection: () => ({ findOneAndUpdate: mockFindOneAndUpdate }) }
}))

/** Hoisted alongside the jest.mock factory, which runs before the imports */
function mockFindOneAndUpdate(/** @type {unknown[]} */ ...args) {
  return findOneAndUpdate(...args)
}

const KEY = { target: 'a@b.com' }

describe('otp lockouts repository', () => {
  it('counts the request in one upsert when nothing races it', async () => {
    findOneAndUpdate.mockResolvedValue({ ...KEY, requests: 1 })

    await expect(incrementRequests(KEY, {}, {})).resolves.toEqual({
      ...KEY,
      requests: 1
    })
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({ $inc: { requests: 1 } }),
      { upsert: true, returnDocument: 'after' }
    )
  })

  it('rethrows a failed upsert without retrying it', async () => {
    // racing first requests are resolved by the server's own upsert retry,
    // so any error that does reach us is a real failure
    findOneAndUpdate.mockRejectedValue(new Error('mongo is down'))

    await expect(incrementRequests(KEY, {}, {})).rejects.toThrow(
      'mongo is down'
    )
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1)
  })
})
