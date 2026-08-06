import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

const isSecureContextEnabled = config.get('isSecureContextEnabled')

export const ACCOUNTS_COLLECTION_NAME = 'accounts'
export const OTPS_COLLECTION_NAME = 'otps'

/**
 * oidc-provider artifact collections (one snake_cased collection per model,
 * written via the persistence endpoints). Listed so `prepareDb` can create
 * their indexes up front.
 */
export const OIDC_COLLECTION_NAMES = [
  'session',
  'interaction',
  'grant',
  'authorization_code',
  'access_token',
  // one row per client assertion id, so a captured assertion cannot be
  // replayed within its lifetime — required by private_key_jwt client auth
  'replay_detection'
]

/**
 * Revoking a grant must delete every artifact issued under it, across all of
 * these collections.
 */
export const GRANTABLE_COLLECTION_NAMES = ['access_token', 'authorization_code']

const MONGO_DUPLICATE_KEY = 11000

/**
 * Whether an error is Mongo's duplicate-key rejection — exposed so callers
 * can react to uniqueness conflicts without knowing Mongo error codes
 * @param {unknown} err
 */
export function isDuplicateKeyError(err) {
  return (
    err instanceof Error && 'code' in err && err.code === MONGO_DUPLICATE_KEY
  )
}

/**
 * @type {Db}
 */
export let db

/**
 * @type {MongoClient}
 */
export let client

/**
 * Connects to mongo database
 * @param {Logger} logger
 */
export async function prepareDb(logger) {
  const mongoUri = config.get('mongo.uri')
  const databaseName = config.get('mongo.databaseName')

  logger.info('Setting up mongodb')

  client = await MongoClient.connect(mongoUri, {
    retryWrites: false,
    readPreference: 'primary',
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- secureContext can be undefined in non-production
    ...(isSecureContextEnabled && secureContext && { secureContext })
  })

  db = client.db(databaseName)

  await createIndexes(db)

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * Creates the collection indexes (idempotent — createIndex is a no-op when
 * the index already exists). TTL indexes are GC only: expiry correctness is
 * enforced in-app because Mongo's TTL sweep is lazy and best-effort.
 * @param {Db} database
 */
export async function createIndexes(database) {
  await database
    .collection(ACCOUNTS_COLLECTION_NAME)
    .createIndex({ email: 1 }, { unique: true })

  await database
    .collection(OTPS_COLLECTION_NAME)
    .createIndex({ uid: 1, purpose: 1 }, { unique: true })
  await database
    .collection(OTPS_COLLECTION_NAME)
    .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })

  for (const name of OIDC_COLLECTION_NAMES) {
    await database
      .collection(name)
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
  }
  // oidc-provider payloads are stored under a `payload` field, so lookups by
  // uid/grantId target the nested keys
  await database.collection('session').createIndex({ 'payload.uid': 1 }, {})
  for (const name of GRANTABLE_COLLECTION_NAMES) {
    await database.collection(name).createIndex({ 'payload.grantId': 1 }, {})
  }
}

/**
 * @import { Db } from 'mongodb'
 * @import { Logger } from 'pino'
 */
