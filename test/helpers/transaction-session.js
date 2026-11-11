/**
 * A stand-in for a MongoDB client session in unit tests, where the
 * repositories are mocked and there is no database to transact against. It
 * runs the transaction callback once and passes on whatever it throws, as
 * the driver does for an error that is not transient.
 *
 * Build it inside beforeEach: the Jest config resets mock implementations
 * before every test.
 */
export function createTransactionSession() {
  /** @type {{ withTransaction: jest.Mock, endSession: jest.Mock }} */
  const session = {
    withTransaction: jest.fn(
      /**
       * @param {(session: unknown) => Promise<unknown>} callback
       */
      async (callback) => callback(session)
    ),
    endSession: jest.fn().mockResolvedValue(undefined)
  }

  return session
}
