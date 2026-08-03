import { createServer } from '~/src/api/server.js'
import { sendEmail } from '~/src/lib/notify.js'
import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  client,
  db
} from '~/src/mongo.js'
import { startMongoMemoryServer } from '~/test/helpers/mongo-memory.js'

/**
 * Registers suite lifecycle hooks that boot the real Hapi server (including
 * prepareDb and its indexes) against an in-memory mongod, and returns
 * helpers for driving the sign-in flow over HTTP.
 *
 * Callers must `jest.mock('~/src/lib/notify.js')` themselves — jest scopes
 * module mocks to the test file. Notify is the only faked seam: the
 * plaintext code exists nowhere but that call (the database stores its
 * argon2 hash), so tests read it from the mock.
 */
export function setupSigninFlow() {
  /** @type {import('mongodb-memory-server').MongoMemoryServer} */
  let mongod
  /** @type {import('@hapi/hapi').Server} */
  let server

  beforeAll(async () => {
    mongod = await startMongoMemoryServer()
    server = await createServer()
    await server.initialize()
  }, 180_000)

  afterEach(() =>
    Promise.all(
      [ACCOUNTS_COLLECTION_NAME, OTPS_COLLECTION_NAME].map((name) =>
        db.collection(name).deleteMany({})
      )
    )
  )

  afterAll(async () => {
    await server.stop()
    await client.close()
    await mongod.stop()
  })

  /**
   * Injects a request into the running server
   * @param {import('@hapi/hapi').ServerInjectOptions} options
   */
  const inject = (options) => server.inject(options)

  /** The code from the most recent Notify email */
  function lastSentCode() {
    const personalisation = jest.mocked(sendEmail).mock.calls.at(-1)?.[2]
    return String(personalisation?.code)
  }

  /**
   * Requests a sign-in code over HTTP and returns the code that "was emailed"
   * @param {string} uid
   */
  async function requestCode(uid, email = 'citizen@example.com') {
    const res = await inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid, email }
    })
    expect(res.statusCode).toBe(204)
    return lastSentCode()
  }

  /**
   * Submits a code for verification and returns the service's verdict
   * @param {string} uid
   * @param {string} code
   * @returns {Promise<Record<string, string>>}
   */
  async function verify(uid, code) {
    const res = await inject({
      method: 'POST',
      url: '/otp/verify',
      payload: { uid, code }
    })
    expect(res.statusCode).toBe(200)
    return JSON.parse(res.payload)
  }

  return { inject, requestCode, verify, lastSentCode }
}
