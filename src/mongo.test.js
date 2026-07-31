import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  createIndexes
} from '~/src/mongo.js'

describe('createIndexes', () => {
  it('creates the unique, TTL and adapter indexes', async () => {
    /** @type {Record<string, jest.Mock>} */
    const collections = {}
    const fakeDb = /** @type {Db} */ (
      /** @type {unknown} */ ({
        /** @param {string} name */
        collection(name) {
          collections[name] ??= jest.fn().mockResolvedValue('ok')
          return { createIndex: collections[name] }
        }
      })
    )

    await createIndexes(fakeDb)

    expect(collections[ACCOUNTS_COLLECTION_NAME]).toHaveBeenCalledWith(
      { email: 1 },
      { unique: true }
    )
    expect(collections[OTPS_COLLECTION_NAME]).toHaveBeenCalledWith(
      { uid: 1, purpose: 1 },
      { unique: true }
    )
    expect(collections[OTPS_COLLECTION_NAME]).toHaveBeenCalledWith(
      { expireAt: 1 },
      { expireAfterSeconds: 0 }
    )
    // every oidc artifact collection gets a TTL sweeper
    expect(collections.session).toHaveBeenCalledWith(
      { expireAt: 1 },
      { expireAfterSeconds: 0 }
    )
    // sessions are also looked up by uid
    expect(collections.session).toHaveBeenCalledWith({ uid: 1 }, {})
    // grantable artifacts are bulk-deleted by grantId
    expect(collections.access_token).toHaveBeenCalledWith({ grantId: 1 }, {})
  })
})

/**
 * @import { Db } from 'mongodb'
 */
