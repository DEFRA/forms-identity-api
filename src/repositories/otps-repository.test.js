import { db } from '~/src/mongo.js'
import { upsert } from '~/src/repositories/otps-repository.js'

jest.mock('~/src/mongo.js', () => ({
  OTPS_COLLECTION_NAME: 'otps',
  db: { collection: jest.fn() },
  isDuplicateKeyError: jest.requireActual('~/src/mongo.js').isDuplicateKeyError
}))

// Only the duplicate-key retry is unit tested here — the race itself cannot
// be forced deterministically against a real database. Everything else about
// this repository is covered by the integration suite.
describe('otps repository upsert collision', () => {
  /** @param {jest.Mock} updateOne */
  function wire(updateOne) {
    jest
      .mocked(db.collection)
      .mockReturnValue(/** @type {never} */ ({ updateOne }))
  }

  it('retries onto the update path when concurrent upserts hit the unique index', async () => {
    const updateOne = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 })
      )
      .mockResolvedValue({})
    wire(updateOne)

    await upsert(
      { uid: 'u-1', purpose: 'SIGNIN_VERIFY_EMAIL' },
      { target: 'a@b.com' }
    )

    expect(updateOne).toHaveBeenCalledTimes(2)
    expect(updateOne).toHaveBeenLastCalledWith(
      { uid: 'u-1', purpose: 'SIGNIN_VERIFY_EMAIL' },
      {
        $set: { target: 'a@b.com' },
        $setOnInsert: { createdAt: expect.any(Date) }
      },
      { upsert: true }
    )
  })

  it('rethrows anything that is not a duplicate-key rejection', async () => {
    const updateOne = jest.fn().mockRejectedValue(new Error('network down'))
    wire(updateOne)

    await expect(
      upsert({ uid: 'u-1', purpose: 'SIGNIN_VERIFY_EMAIL' }, {})
    ).rejects.toThrow('network down')
    expect(updateOne).toHaveBeenCalledTimes(1)
  })
})
