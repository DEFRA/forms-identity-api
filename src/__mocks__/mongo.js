import { buildMockCollection } from '~/src/__stubs__/mongo.js'

export const OTP_CODE_COLLECTION_NAME = 'otp_code'
export const USERS_COLLECTION_NAME = 'users'

/**
 * @type {Mocked<MongoClient>}
 */
export let client

/**
 * Mocked live-binding `db` — a plain function (not a jest.fn) so the jest
 * `resetMocks` config cannot strip its implementation between tests.
 * @type {Db}
 */
export const db = /** @type {Db} */ (
  /** @type {unknown} */ ({
    collection: () => buildMockCollection()
  })
)

/**
 * Prepare the database and establish a connection
 */
export function prepareDb() {
  client = /** @satisfies {MongoClient} */ ({
    startSession: () => ({
      endSession: jest.fn().mockResolvedValue(undefined),
      /* @ts-expect-error TODO: Fix types of parameters 'fn' and 'fn' are incompatible.  Type 'WithTransactionCallback<T>' is not assignable to type '() => Promise<void>'. Target signature provides too few arguments. Expected 1 or more, but got 0. */
      withTransaction: jest.fn(
        /**
         * Mock transaction handler
         * @param {() => Promise<void>} fn
         */
        async (fn) => fn()
      )
    })
  })
  return Promise.resolve(db)
}

/**
 * @import { Db, MongoClient, WithTransactionCallback } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { Mocked, Mock } from 'jest-mock'
 */
