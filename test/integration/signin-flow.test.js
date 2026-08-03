import { createServer } from '~/src/api/server.js'
import { sendEmail } from '~/src/lib/notify.js'
import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  client,
  db
} from '~/src/mongo.js'
import { createAccount } from '~/src/services/signin-service.js'
import { startMongoMemoryServer } from '~/test/helpers/mongo-memory.js'

jest.mock('~/src/lib/notify.js', () => ({
  // Notify is the only faked seam: the plaintext code exists nowhere but this
  // call (the database stores its argon2 hash), so tests read it from here
  sendEmail: jest.fn()
}))

/** @type {import('mongodb-memory-server').MongoMemoryServer} */
let mongod
/** @type {import('@hapi/hapi').Server} */
let server

beforeAll(async () => {
  mongod = await startMongoMemoryServer()
  server = await createServer() // runs prepareDb, so indexes are the real ones
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
  const res = await server.inject({
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
  const res = await server.inject({
    method: 'POST',
    url: '/otp/verify',
    payload: { uid, code }
  })
  expect(res.statusCode).toBe(200)
  return JSON.parse(res.payload)
}

describe('citizen sign-in flow (real server, real Mongo)', () => {
  it('signs a new user up end to end, with four fumbled attempts on the way', async () => {
    const code = await requestCode('uid-flow-1', 'Citizen@Example.com')

    const shown = await server.inject({ method: 'GET', url: '/otp/uid-flow-1' })
    expect(JSON.parse(shown.payload)).toEqual({ email: 'citizen@example.com' })

    for (let i = 0; i < 4; i++) {
      expect(await verify('uid-flow-1', '000000')).toEqual({
        status: 'invalid'
      })
    }
    expect(await verify('uid-flow-1', code)).toEqual({
      status: 'phone-required'
    })

    const completed = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-flow-1', phone: '07911 123456' }
    })
    const { status, accountId } = JSON.parse(completed.payload)
    expect(status).toBe('signed-in')

    const claims = await server.inject({
      method: 'GET',
      url: `/accounts/${accountId}`
    })
    expect(JSON.parse(claims.payload)).toEqual({
      id: accountId,
      email: 'citizen@example.com'
    })

    const stored = await db
      .collection(ACCOUNTS_COLLECTION_NAME)
      .findOne({ _id: /** @type {never} */ (accountId) })
    expect(stored).toMatchObject({
      email: 'citizen@example.com',
      phone: '+447911123456',
      status: 'active'
    })
  })

  it('signs an existing account straight in from the code', async () => {
    const account = await createAccount('citizen@example.com', '+447911123456')

    const code = await requestCode('uid-flow-2')

    expect(await verify('uid-flow-2', code)).toEqual({
      status: 'signed-in',
      accountId: account._id
    })
    const otp = await db
      .collection(OTPS_COLLECTION_NAME)
      .findOne({ uid: 'uid-flow-2' })
    expect(otp?.consumed).toBe(true)
  })

  it('burns the code after five wrong attempts — the real code is rejected afterwards', async () => {
    const code = await requestCode('uid-flow-3')

    for (let i = 0; i < 5; i++) {
      await verify('uid-flow-3', '000000')
    }

    expect(await verify('uid-flow-3', code)).toEqual({ status: 'invalid' })
  }, 15_000)

  it('a resend invalidates the old code and restores the attempt budget', async () => {
    const codeA = await requestCode('uid-flow-4')
    for (let i = 0; i < 4; i++) {
      await verify('uid-flow-4', '000000')
    }

    const codeB = await requestCode('uid-flow-4')

    expect(await verify('uid-flow-4', codeA)).toEqual({ status: 'invalid' })
    expect(await verify('uid-flow-4', codeB)).toEqual({
      status: 'phone-required'
    })
  }, 15_000)

  it('rejects an expired code in-app without waiting for the TTL sweep', async () => {
    const code = await requestCode('uid-flow-5')
    await db
      .collection(OTPS_COLLECTION_NAME)
      .updateOne(
        { uid: 'uid-flow-5' },
        { $set: { expireAt: new Date(Date.now() - 1000) } }
      )

    expect(await verify('uid-flow-5', code)).toEqual({ status: 'invalid' })
  })

  it('handles concurrent code requests without crashing, keeping one record', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        server.inject({
          method: 'POST',
          url: '/otp/request',
          payload: { uid: 'uid-flow-6', email: 'citizen@example.com' }
        })
      )
    )

    for (const res of responses) {
      expect(res.statusCode).toBe(204)
    }
    await expect(
      db.collection(OTPS_COLLECTION_NAME).countDocuments({ uid: 'uid-flow-6' })
    ).resolves.toBe(1)
  })

  it('yields a single account when concurrent signups race on one email', async () => {
    // the unique email index rejects the losing insert with a real E11000,
    // which createAccount resolves to the winner's account
    const [a, b] = await Promise.all([
      createAccount('race@example.com', '+447911123456'),
      createAccount('race@example.com', '+447911123456')
    ])

    expect(a._id).toBe(b._id)
    await expect(
      db
        .collection(ACCOUNTS_COLLECTION_NAME)
        .countDocuments({ email: 'race@example.com' })
    ).resolves.toBe(1)
  })

  it('surfaces a Notify outage as a 500, and a resend recovers the interaction', async () => {
    jest.mocked(sendEmail).mockRejectedValueOnce(new Error('Notify is down'))

    const failed = await server.inject({
      method: 'POST',
      url: '/otp/request',
      payload: { uid: 'uid-flow-7', email: 'citizen@example.com' }
    })
    expect(failed.statusCode).toBe(500)

    const code = await requestCode('uid-flow-7')
    expect(await verify('uid-flow-7', code)).toEqual({
      status: 'phone-required'
    })
  })

  it('rejects a landline at the phone step without spending the interaction', async () => {
    const code = await requestCode('uid-flow-8')
    await verify('uid-flow-8', code)

    const landline = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-flow-8', phone: '020 7946 0000' }
    })
    expect(JSON.parse(landline.payload)).toEqual({ status: 'invalid-phone' })

    const mobile = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-flow-8', phone: '07911 123456' }
    })
    expect(JSON.parse(mobile.payload)).toMatchObject({ status: 'signed-in' })
  })

  it('stops non-telephone input at route validation with 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-flow-9', phone: 'not a number' }
    })

    expect(res.statusCode).toBe(400)
  })

  it('rejects completion for an interaction that never verified', async () => {
    await requestCode('uid-flow-10')

    const res = await server.inject({
      method: 'POST',
      url: '/accounts',
      payload: { uid: 'uid-flow-10', phone: '07911 123456' }
    })

    expect(JSON.parse(res.payload)).toEqual({ status: 'invalid' })
  })

  it('returns 404 for unknown interactions and accounts', async () => {
    const otp = await server.inject({ method: 'GET', url: '/otp/uid-none' })
    expect(otp.statusCode).toBe(404)

    const account = await server.inject({
      method: 'GET',
      url: '/accounts/acc-none'
    })
    expect(account.statusCode).toBe(404)
  })
})

describe('startup indexes (the ones the security model depends on)', () => {
  /**
   * @param {string} collection
   * @returns {Promise<import('mongodb').IndexDescriptionInfo[]>}
   */
  const indexesOf = (collection) => db.collection(collection).indexes()

  it('enforces account email uniqueness and one code per {uid, purpose}', async () => {
    expect(await indexesOf(ACCOUNTS_COLLECTION_NAME)).toContainEqual(
      expect.objectContaining({ key: { email: 1 }, unique: true })
    )
    expect(await indexesOf(OTPS_COLLECTION_NAME)).toContainEqual(
      expect.objectContaining({ key: { uid: 1, purpose: 1 }, unique: true })
    )
  })

  it('gives otps and every oidc artifact collection a TTL sweeper', async () => {
    for (const name of [OTPS_COLLECTION_NAME, 'session', 'access_token']) {
      expect(await indexesOf(name)).toContainEqual(
        expect.objectContaining({ key: { expireAt: 1 }, expireAfterSeconds: 0 })
      )
    }
  })

  it('indexes the nested oidc lookup keys', async () => {
    expect(await indexesOf('session')).toContainEqual(
      expect.objectContaining({ key: { 'payload.uid': 1 } })
    )
    expect(await indexesOf('access_token')).toContainEqual(
      expect.objectContaining({ key: { 'payload.grantId': 1 } })
    )
  })
})
