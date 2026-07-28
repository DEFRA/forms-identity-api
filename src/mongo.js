import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

const isSecureContextEnabled = config.get('isSecureContextEnabled')

export const OTP_CODE_COLLECTION_NAME = 'otp_code'
export const USERS_COLLECTION_NAME = 'users'

/**
 * oidc-provider artifact collections (one snake_cased collection per model,
 * created on demand by the Mongo adapter). Listed here so `prepareDb` can
 * create their indexes up front.
 */
const OIDC_COLLECTION_NAMES = [
  'session',
  'access_token',
  'authorization_code',
  'grant',
  'interaction',
  'refresh_token',
  'device_code'
]

const GRANTABLE_COLLECTION_NAMES = [
  'access_token',
  'authorization_code',
  'refresh_token'
]

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
 * the index already exists)
 * @param {Db} database
 */
async function createIndexes(database) {
  await database
    .collection(USERS_COLLECTION_NAME)
    .createIndex({ email: 1 }, { unique: true })

  // TTL sweeper for one-time codes and oidc-provider artifacts. This is GC
  // only — expiry correctness is enforced in-app (otp-service checks expireAt
  // and oidc-provider checks its own exp), never delegated to Mongo's sweep.
  for (const name of [OTP_CODE_COLLECTION_NAME, ...OIDC_COLLECTION_NAMES]) {
    await database
      .collection(name)
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
  }

  await database.collection('session').createIndex({ uid: 1 })
  await database.collection('device_code').createIndex({ userCode: 1 })

  for (const name of GRANTABLE_COLLECTION_NAMES) {
    await database.collection(name).createIndex({ grantId: 1 })
  }
}

/**
 * @import { Db } from 'mongodb'
 * @import { Logger } from 'pino'
 */
