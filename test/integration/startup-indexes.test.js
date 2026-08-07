import {
  ACCOUNTS_COLLECTION_NAME,
  GRANTABLE_COLLECTION_NAMES,
  OIDC_COLLECTION_NAMES,
  OTPS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'
import { setupIntegrationDb } from '~/test/helpers/mongo-memory.js'

setupIntegrationDb()

/**
 * @param {string} collection
 * @returns {Promise<import('mongodb').IndexDescriptionInfo[]>}
 */
const indexesOf = (collection) => db.collection(collection).indexes()

describe('startup indexes', () => {
  it('enforces account email uniqueness and one code per {uid, purpose}', async () => {
    expect(await indexesOf(ACCOUNTS_COLLECTION_NAME)).toContainEqual(
      expect.objectContaining({ key: { email: 1 }, unique: true })
    )
    expect(await indexesOf(OTPS_COLLECTION_NAME)).toContainEqual(
      expect.objectContaining({ key: { uid: 1, purpose: 1 }, unique: true })
    )
  })

  // iterating the lists rather than a sample: a model added to one of them
  // without its index fails here rather than accumulating records forever
  it.each([OTPS_COLLECTION_NAME, ...OIDC_COLLECTION_NAMES])(
    'gives %s a TTL sweeper',
    async (name) => {
      expect(await indexesOf(name)).toContainEqual(
        expect.objectContaining({ key: { expireAt: 1 }, expireAfterSeconds: 0 })
      )
    }
  )

  it.each(GRANTABLE_COLLECTION_NAMES)(
    'indexes %s by the grant it was issued under',
    async (name) => {
      expect(await indexesOf(name)).toContainEqual(
        expect.objectContaining({ key: { 'payload.grantId': 1 } })
      )
    }
  )

  it('indexes sessions by uid, uniquely', async () => {
    // the provider generates a session uid per sign-in, so a collision is a
    // fault worth failing on rather than quietly storing twice
    expect(await indexesOf('session')).toContainEqual(
      expect.objectContaining({ key: { 'payload.uid': 1 }, unique: true })
    )
  })
})
