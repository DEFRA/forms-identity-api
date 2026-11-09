import { logger } from '~/src/helpers/logging/logger.js'

/**
 * Runs an audit write for a change that has already been committed. The
 * change cannot be undone by then, so a failure to publish is logged rather
 * than thrown: throwing would answer the caller with an error for a change
 * that happened, and their retry would be refused because the one-time code
 * is already spent.
 * @param {() => Promise<unknown>} audit
 */
export async function auditAfterCommit(audit) {
  try {
    await audit()
  } catch (err) {
    logger.error(
      err,
      'Failed to publish an audit event after the database change was committed'
    )
  }
}
