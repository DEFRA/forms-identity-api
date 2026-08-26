import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import { sendEmail } from '~/src/lib/notify.js'
import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  client,
  db
} from '~/src/mongo.js'
import {
  MONGO_BOOT_TIMEOUT_MS,
  startMongoMemoryServer
} from '~/test/helpers/mongo-memory.js'
import {
  mintToken,
  startServiceAuthStub,
  stopServiceAuthStub
} from '~/test/helpers/service-auth.js'

/** The code from the most recent Notify email */
function lastSentCode() {
  const personalisation = jest.mocked(sendEmail).mock.calls.at(-1)?.[2]
  return String(personalisation?.code)
}

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
    startServiceAuthStub()
    mongod = await startMongoMemoryServer()
    server = await createServer()
    await server.initialize()
  }, MONGO_BOOT_TIMEOUT_MS)

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
    stopServiceAuthStub()
  })

  /**
   * Injects a request into the running server as the allowed caller, so flow
   * tests exercise the routes behind the same token check production
   * enforces rather than bypassing it.
   * @param {import('@hapi/hapi').ServerInjectOptions} options
   */
  const inject = (options) =>
    server.inject({
      ...options,
      headers: {
        ...options.headers,
        authorization: `Bearer ${mintToken()}`
      }
    })

  /**
   * Injects a request with no bearer token, so a test can prove the
   * deny-by-default policy actually refuses an unauthenticated caller end
   * to end, on the same server every other test in the suite talks to.
   * @param {import('@hapi/hapi').ServerInjectOptions} options
   */
  const injectWithoutToken = (options) => server.inject(options)

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
    expect(res.statusCode).toBe(StatusCodes.NO_CONTENT)
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
    expect(res.statusCode).toBe(StatusCodes.OK)
    return JSON.parse(res.payload)
  }

  return { inject, injectWithoutToken, requestCode, verify, lastSentCode }
}
