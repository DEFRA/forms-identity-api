import { MongoMemoryReplSet } from 'mongodb-memory-server'

import { config } from '~/src/config/index.js'
import { client, prepareDb } from '~/src/mongo.js'

/**
 * Booting mongod can include downloading the binary on a cold cache, which is
 * far slower than jest's default timeout allows for.
 */
export const MONGO_BOOT_TIMEOUT_MS = 180_000

/**
 * Boots an in-memory single-node replica set and points the app config at it,
 * so integration suites exercise transaction semantics as well as genuine
 * Mongo behavior. Callers own the lifecycle — stop() it in afterAll,
 * alongside closing the app's Mongo client.
 *
 * The mongod version comes from config.mongodbMemoryServer.version in
 * package.json, which mongodb-memory-server reads itself. The platform runs
 * MongoDB 6.0 (see the CDP compose files), so integration tests exercise the
 * same major version. CI reads the same value to choose the mongo image it
 * copies the binary from, so there is only one place to change it.
 */
export async function startMongoMemoryReplSet() {
  // WiredTiger, as in production: the default in-memory engine does not
  // support the snapshot reads that transactions use
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  })

  config.set('mongo.uri', mongod.getUri())

  return mongod
}

/**
 * Registers suite lifecycle hooks for integration tests that talk to the
 * database directly (no HTTP server): boots an in-memory replica set, runs
 * prepareDb so the real startup indexes exist, and tears both down after
 * the suite
 */
export function setupIntegrationDb() {
  /** @type {MongoMemoryReplSet} */
  let mongod

  beforeAll(async () => {
    mongod = await startMongoMemoryReplSet()
    await prepareDb(/** @type {never} */ ({ info: () => undefined }))
  }, MONGO_BOOT_TIMEOUT_MS)

  afterAll(async () => {
    await client.close()
    await mongod.stop()
  })
}
