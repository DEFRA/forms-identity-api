/**
 * A test document: string `_id`s (as the OIDC adapter and services use), any
 * other fields allowed
 * @typedef {{ _id: string } & Document} TestDocument
 */

/**
 * Builds a jest-mocked Mongo collection (forms-manager idiom) so unit tests
 * never touch a real database.
 * @returns {Mocked<Collection<TestDocument>>}
 */
export const buildMockCollection = () => {
  return /** @type {Mocked<Collection<TestDocument>>} */ (
    /** @type {unknown} */ ({
      bulkWrite: jest.fn(),
      count: jest.fn(),
      countDocuments: jest.fn(),
      db: jest.fn(),
      deleteMany: jest.fn(),
      deleteOne: jest.fn(),
      hint: jest.fn(),
      insertMany: jest.fn(),
      insertOne: jest.fn(),
      replaceOne: jest.fn(),
      updateMany: jest.fn(),
      updateOne: jest.fn(),
      aggregate: jest.fn(),
      createIndex: jest.fn(),
      createIndexes: jest.fn(),
      distinct: jest.fn(),
      drop: jest.fn(),
      dropIndex: jest.fn(),
      dropIndexes: jest.fn(),
      estimatedDocumentCount: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndDelete: jest.fn(),
      findOneAndReplace: jest.fn(),
      findOneAndUpdate: jest.fn(),
      indexExists: jest.fn(),
      indexInformation: jest.fn(),
      indexes: jest.fn(),
      isCapped: jest.fn(),
      listIndexes: jest.fn(),
      rename: jest.fn(),
      options: jest.fn(),
      watch: jest.fn()
    })
  )
}

/**
 * Builds a jest-mocked Mongo `Db` whose `collection(name)` always returns the
 * supplied mock collection.
 * @param {Collection<TestDocument>} collection
 * @returns {Db}
 */
export const buildMockDb = (collection) => {
  return /** @type {Db} */ (
    /** @type {unknown} */ ({
      collection: jest.fn().mockReturnValue(collection)
    })
  )
}

/**
 * @import { Collection, Db, Document } from 'mongodb'
 * @import { Mocked } from 'jest-mock'
 */
