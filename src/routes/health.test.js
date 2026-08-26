import { createServer } from '~/src/api/server.js'
import {
  startServiceAuthStub,
  stopServiceAuthStub
} from '~/test/helpers/service-auth.js'

jest.mock('~/src/mongo.js', () => ({
  prepareDb: jest.fn(),
  // Server wiring builds the sign-in services at registration, so the fake
  // db must exist even though /health never touches it
  db: { collection: () => ({}) },
  ACCOUNTS_COLLECTION_NAME: 'accounts',
  OTPS_COLLECTION_NAME: 'otps',
  OIDC_COLLECTION_NAMES: [],
  GRANTABLE_COLLECTION_NAMES: []
}))

describe('Health route', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    // The server-wide auth default warms its JWKS cache on initialize, so
    // this needs a reachable key set even though /health itself opts out.
    startServiceAuthStub()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
    stopServiceAuthStub()
  })

  const okStatusCode = 200
  const jsonContentType = 'application/json'

  describe('Success responses', () => {
    test('Testing GET /health route returns 200', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
