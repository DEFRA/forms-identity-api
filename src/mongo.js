import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

const isSecureContextEnabled = config.get('isSecureContextEnabled')

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

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Db } from 'mongodb'
 * @import { Logger } from 'pino'
 */
