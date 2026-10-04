import {
  USER_ID_HEADER,
  getCorrelationId,
  getUserId
} from '@defra/forms-common'
import { getTraceId } from '@defra/hapi-tracing'
import hapi from '@hapi/hapi'

import {
  getRequestUserId,
  requestTracing
} from '~/src/helpers/request-tracing.js'

describe('request-tracing', () => {
  const tracingHeader = 'x-cdp-request-id'
  const correlationId = '1066e8cc-8e1e-4671-8ad7-b4cd9c95bb94'
  const userId = '86758ba9-92e7-4287-9751-7705e449f0a5'

  describe('plugin', () => {
    /** @type {Server} */
    let server

    /** @type {{ correlationId?: string, userId?: string }} */
    let responseContext

    beforeEach(async () => {
      server = hapi.server()
      responseContext = {}

      server.auth.scheme('test', () => ({
        authenticate(request, h) {
          return h.authenticated({ credentials: {} })
        }
      }))
      server.auth.strategy('test', 'test')

      await server.register(requestTracing)

      const handler = () => ({
        correlationId: getCorrelationId(),
        traceId: getTraceId(),
        userId: getUserId()
      })

      server.route([
        { method: 'GET', path: '/open', handler },
        {
          method: 'GET',
          path: '/secure',
          handler,
          options: { auth: 'test' }
        }
      ])

      // The response log is written when this event is emitted
      server.events.on('response', () => {
        responseContext = {
          correlationId: getCorrelationId(),
          userId: getUserId()
        }
      })
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should use the correlation ID from the tracing header', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/open',
        headers: { [tracingHeader]: correlationId }
      })

      expect(result).toEqual({
        correlationId,
        traceId: correlationId,
        userId: undefined
      })
      expect(responseContext).toEqual({ correlationId, userId: undefined })
    })

    it('should add the user ID sent by an authenticated caller', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/secure',
        headers: { [tracingHeader]: correlationId, [USER_ID_HEADER]: userId }
      })

      expect(result).toEqual({
        correlationId,
        traceId: correlationId,
        userId
      })
      expect(responseContext).toEqual({ correlationId, userId })
    })

    it('should ignore the user ID sent to a route without authentication', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/open',
        headers: { [tracingHeader]: correlationId, [USER_ID_HEADER]: userId }
      })

      expect(result).toEqual({
        correlationId,
        traceId: correlationId,
        userId: undefined
      })
    })
  })

  describe('getRequestUserId', () => {
    /**
     * @param {boolean} isAuthenticated
     */
    function buildRequest(isAuthenticated) {
      return /** @type {Request} */ (
        /** @type {unknown} */ ({
          auth: { isAuthenticated },
          headers: { [USER_ID_HEADER]: userId }
        })
      )
    }

    it('should return the user ID header of an authenticated request', () => {
      expect(getRequestUserId(buildRequest(true))).toBe(userId)
    })

    it('should return undefined when the request is not authenticated', () => {
      expect(getRequestUserId(buildRequest(false))).toBeUndefined()
    })
  })
})

/**
 * @import { Request, Server } from '@hapi/hapi'
 */
