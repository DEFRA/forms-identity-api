import { db } from '~/src/mongo.js'
import {
  findByEmail,
  findById,
  insert,
  isDuplicateKeyError
} from '~/src/repositories/accounts-repository.js'

jest.mock('~/src/mongo.js', () => ({
  ACCOUNTS_COLLECTION_NAME: 'accounts',
  db: { collection: jest.fn() }
}))

/** Wires a fake accounts collection into the mocked db */
function fakeColl() {
  const coll = {
    findOne: jest.fn(),
    insertOne: jest.fn()
  }
  jest.mocked(db.collection).mockReturnValue(/** @type {never} */ (coll))
  return coll
}

describe('accounts repository', () => {
  it('finds by email and id with exact filters', async () => {
    const coll = fakeColl()
    coll.findOne.mockResolvedValue(null)

    await findByEmail('citizen@example.com')
    expect(coll.findOne).toHaveBeenCalledWith({
      email: 'citizen@example.com'
    })

    await findById('acc-1')
    expect(coll.findOne).toHaveBeenCalledWith({ _id: 'acc-1' })
  })

  it('insert stores the document and returns it', async () => {
    const coll = fakeColl()
    coll.insertOne.mockResolvedValue({ acknowledged: true })
    const account = /** @type {never} */ ({ _id: 'acc-1', email: 'a@b.com' })

    await expect(insert(account)).resolves.toBe(account)
    expect(coll.insertOne).toHaveBeenCalledWith(account)
  })

  it('recognises Mongo duplicate-key errors', () => {
    expect(
      isDuplicateKeyError(Object.assign(new Error('E11000'), { code: 11000 }))
    ).toBe(true)
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false)
    expect(isDuplicateKeyError('nope')).toBe(false)
  })
})
