import { incrementRequests } from '~/src/repositories/otp-lockouts-repository.js'

const findOneAndUpdate = jest.fn()

jest.mock('~/src/mongo.js', () => ({
  OTP_LOCKOUTS_COLLECTION_NAME: 'otp-lockouts',
  db: { collection: () => ({ findOneAndUpdate: mockFindOneAndUpdate }) },
  isDuplicateKeyError: (/** @type {unknown} */ err) =>
    err instanceof Error && 'code' in err && err.code === 11000
}))

/** Hoisted alongside the jest.mock factory, which runs before the imports */
function mockFindOneAndUpdate(/** @type {unknown[]} */ ...args) {
  return findOneAndUpdate(...args)
}

/** A real Mongo duplicate-key rejection */
function duplicateKeyError() {
  return Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
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

  it('retries as a plain increment when a racing request minted the counter first', async () => {
    // losing the insert race must still count the request, not fail it
    findOneAndUpdate
      .mockRejectedValueOnce(duplicateKeyError())
      .mockResolvedValueOnce({ ...KEY, requests: 2 })

    await expect(incrementRequests(KEY, {}, {})).resolves.toEqual({
      ...KEY,
      requests: 2
    })
    expect(findOneAndUpdate).toHaveBeenLastCalledWith(
      KEY,
      expect.objectContaining({ $inc: { requests: 1 } }),
      { returnDocument: 'after' }
    )
  })

  it('rethrows anything that is not a duplicate key', async () => {
    findOneAndUpdate.mockRejectedValue(new Error('mongo is down'))

    await expect(incrementRequests(KEY, {}, {})).rejects.toThrow(
      'mongo is down'
    )
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1)
  })
})
