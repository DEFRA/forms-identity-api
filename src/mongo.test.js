import { ACCOUNTS_COLLECTION_NAME, createIndexes } from '~/src/mongo.js'

/**
 * @param {object[]} accountIndexes
 */
function createDatabase(accountIndexes) {
  const collection = {
    listIndexes: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(accountIndexes)
    }),
    dropIndex: jest.fn(),
    createIndex: jest.fn()
  }

  return {
    database: {
      listCollections: jest.fn().mockReturnValue({
        toArray: jest
          .fn()
          .mockResolvedValue([{ name: ACCOUNTS_COLLECTION_NAME }])
      }),
      collection: jest.fn().mockReturnValue(collection)
    },
    collection
  }
}

describe('createIndexes', () => {
  it('creates the account index when the accounts collection does not exist yet', async () => {
    const { database, collection } = createDatabase([])
    database.listCollections.mockReturnValueOnce({
      toArray: jest.fn().mockResolvedValue([])
    })

    await createIndexes(/** @type {never} */ (database))

    expect(collection.listIndexes).not.toHaveBeenCalled()
    expect(collection.dropIndex).not.toHaveBeenCalled()
    expect(collection.createIndex).toHaveBeenCalledWith(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: { status: 'active' }
      }
    )
  })

  it('drops the legacy unique email index before creating the partial index', async () => {
    const { database, collection } = createDatabase([
      { key: { _id: 1 }, unique: true },
      { key: { email: 1 }, unique: true }
    ])

    await createIndexes(/** @type {never} */ (database))

    expect(collection.dropIndex).toHaveBeenCalledWith('email_1')
    expect(collection.dropIndex.mock.invocationCallOrder[0]).toBeLessThan(
      collection.createIndex.mock.invocationCallOrder[0]
    )
    expect(collection.createIndex).toHaveBeenCalledWith(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: { status: 'active' }
      }
    )
    expect(database.collection).toHaveBeenCalledWith(ACCOUNTS_COLLECTION_NAME)
  })

  it.each([
    [
      'the partial unique email index',
      {
        key: { email: 1 },
        unique: true,
        partialFilterExpression: { status: 'active' }
      }
    ],
    ['a non-unique email index', { key: { email: 1 } }],
    ['a compound email index', { key: { email: 1, status: 1 }, unique: true }]
  ])('does not drop %s', async (_description, index) => {
    const { database, collection } = createDatabase([index])

    await createIndexes(/** @type {never} */ (database))

    expect(collection.dropIndex).not.toHaveBeenCalled()
  })
})
