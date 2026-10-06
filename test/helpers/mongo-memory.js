import { MongoMemoryServer } from 'mongodb-memory-server'

import { config } from '~/src/config/index.js'
import { client, prepareDb } from '~/src/mongo.js'

/**
 * Booting mongod can include downloading the binary on a cold cache, which is
 * far slower than jest's default timeout allows for.
 */
export const MONGO_BOOT_TIMEOUT_MS = 180_000

/**
 * Boots an in-memory mongod (a real MongoDB binary backed by in-memory
 * storage) and points the app config at it, so integration suites run against
 * genuine Mongo semantics: unique indexes, atomic filtered updates and
 * duplicate-key errors. Callers own the lifecycle — stop() it in afterAll,
 * alongside closing the app's Mongo client.
 *
 * The mongod version comes from config.mongodbMemoryServer.version in
 * package.json, which mongodb-memory-server reads itself. The platform runs
 * MongoDB 6.0 (see the CDP compose files), so integration tests exercise the
 * same major version. CI reads the same value to choose the mongo image it
 * copies the binary from, so there is only one place to change it.
 */
export async function startMongoMemoryServer() {
  const mongod = await MongoMemoryServer.create()

  config.set('mongo.uri', mongod.getUri())

  return mongod
}

/**
 * Registers suite lifecycle hooks for integration tests that talk to the
 * database directly (no HTTP server): boots an in-memory mongod, runs
 * prepareDb so the real startup indexes exist, and tears both down after
 * the suite
 */
export function setupIntegrationDb() {
  /** @type {MongoMemoryServer} */
  let mongod

  beforeAll(async () => {
    mongod = await startMongoMemoryServer()
    await prepareDb(/** @type {never} */ ({ info: () => undefined }))
  }, MONGO_BOOT_TIMEOUT_MS)

  afterAll(async () => {
    await client.close()
    await mongod.stop()
  })
}
