import {
  ACCOUNTS_COLLECTION_NAME,
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

  it('gives otps and every oidc artifact collection a TTL sweeper', async () => {
    for (const name of [OTPS_COLLECTION_NAME, 'session', 'access_token']) {
      expect(await indexesOf(name)).toContainEqual(
        expect.objectContaining({ key: { expireAt: 1 }, expireAfterSeconds: 0 })
      )
    }
  })

  it('indexes the nested oidc lookup keys', async () => {
    expect(await indexesOf('session')).toContainEqual(
      expect.objectContaining({ key: { 'payload.uid': 1 } })
    )
    expect(await indexesOf('access_token')).toContainEqual(
      expect.objectContaining({ key: { 'payload.grantId': 1 } })
    )
  })
})
