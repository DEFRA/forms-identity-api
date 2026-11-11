import { client } from '~/src/mongo.js'

/**
 * Majority write concern so a committed transaction survives a failover, and
 * a snapshot read so every read in the transaction sees one consistent state.
 * @type {TransactionOptions}
 */
const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' }
}

/**
 * Thrown by {@link rollback} to abandon a transaction with a result
 */
class TransactionRolledBack extends Error {
  /**
   * @param {unknown} result
   */
  constructor(result) {
    super('Transaction rolled back')
    this.name = 'TransactionRolledBack'
    this.result = result
  }
}

/**
 * Abandons the running transaction, discarding every write made in it, and
 * makes {@link runInTransaction} resolve with the given result.
 * @param {unknown} result
 * @returns {never}
 */
export function rollback(result) {
  throw new TransactionRolledBack(result)
}

/**
 * Runs the callback in a MongoDB transaction: either every write made through
 * the session commits, or none of them do. Pass the session to each
 * repository call that belongs to the transaction.
 *
 * The callback can run more than once, because the driver retries the whole
 * transaction on a transient error such as a write conflict — keep reads in
 * it too, so a retry sees fresh state. Audit publishing is deliberately run
 * inside the callback alongside the database writes it belongs with, so
 * that a failed publish rolls the writes back instead of leaving the
 * database and the audit trail disagreeing with each other. Any error
 * thrown from the callback rolls the transaction back and is rethrown.
 * @template T
 * @param {(session: ClientSession) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function runInTransaction(callback) {
  const session = client.startSession()

  try {
    return await session.withTransaction(
      () => callback(session),
      TRANSACTION_OPTIONS
    )
  } catch (err) {
    if (err instanceof TransactionRolledBack) {
      return /** @type {T} */ (err.result)
    }
    throw err
  } finally {
    await session.endSession()
  }
}

/**
 * @import { ClientSession, TransactionOptions } from 'mongodb'
 */
