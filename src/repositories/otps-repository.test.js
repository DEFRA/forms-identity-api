import { db } from '~/src/mongo.js'
import {
  findOne,
  incrementAttempts,
  update,
  upsert
} from '~/src/repositories/otps-repository.js'

jest.mock('~/src/mongo.js', () => ({
  OTPS_COLLECTION_NAME: 'otps',
  db: { collection: jest.fn() }
}))

/** Wires a fake otps collection into the mocked db */
function fakeColl() {
  const coll = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn()
  }
  jest.mocked(db.collection).mockReturnValue(/** @type {never} */ (coll))
  return coll
}

describe('otps repository', () => {
  it('findOne passes the filter through', async () => {
    const coll = fakeColl()
    coll.findOne.mockResolvedValue(null)

    await findOne({ uid: 'u-1', purpose: 'SIGNIN_VERIFY_EMAIL' })

    expect(coll.findOne).toHaveBeenCalledWith({
      uid: 'u-1',
      purpose: 'SIGNIN_VERIFY_EMAIL'
    })
  })

  it('upsert sets fields and stamps createdAt only on insert', async () => {
    const coll = fakeColl()
    coll.updateOne.mockResolvedValue({})

    await upsert(
      { uid: 'u-1', purpose: 'SIGNIN_VERIFY_EMAIL' },
      { target: 'a@b.com' }
    )

    expect(coll.updateOne).toHaveBeenCalledWith(
      { uid: 'u-1', purpose: 'SIGNIN_VERIFY_EMAIL' },
      {
        $set: { target: 'a@b.com' },
        $setOnInsert: { createdAt: expect.any(Date) }
      },
      { upsert: true }
    )
  })

  it('update sets fields and reports whether a record matched', async () => {
    const coll = fakeColl()
    coll.updateOne.mockResolvedValue({ matchedCount: 1 })

    await expect(update({ uid: 'u-1' }, { consumed: true })).resolves.toBe(true)
    expect(coll.updateOne).toHaveBeenCalledWith(
      { uid: 'u-1' },
      { $set: { consumed: true } }
    )

    coll.updateOne.mockResolvedValue({ matchedCount: 0 })
    await expect(update({ uid: 'gone' }, { consumed: true })).resolves.toBe(
      false
    )
  })

  it('incrementAttempts is atomic and returns the updated record', async () => {
    const coll = fakeColl()
    coll.findOneAndUpdate.mockResolvedValue({ attempts: 3 })

    const updated = await incrementAttempts({ uid: 'u-1' })

    expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
      { uid: 'u-1' },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after' }
    )
    expect(updated).toEqual({ attempts: 3 })
  })
})
