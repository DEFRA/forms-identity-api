import {
  handleInteractionEntry,
  interactionRoutes
} from '~/src/routes/interaction.js'

/**
 * @typedef {(request: any, h?: any) => Promise<any>} RouteHandler
 */

/**
 * Finds a route and returns its handler
 * @param {ServerRoute[]} routes
 * @param {string} method
 * @param {string} path
 * @returns {RouteHandler}
 */
function findHandler(routes, method, path) {
  const route = routes.find(
    (item) => item.method === method && item.path === path
  )
  return /** @type {RouteHandler} */ (route?.handler)
}

describe('interaction entry', () => {
  it('auto-grants consent for the first-party client (no consent screen)', async () => {
    const save = jest.fn().mockResolvedValue('grant-123')
    const addOIDCScope = jest.fn()
    const provider = /** @type {any} */ ({
      interactionDetails: jest.fn().mockResolvedValue({
        uid: 'u1',
        prompt: { name: 'consent' },
        params: { client_id: 'runner', scope: 'openid email' },
        session: { accountId: 'user-1' }
      }),
      interactionFinished: jest.fn().mockResolvedValue(undefined),
      // regular function, not an arrow: arrow functions can't be `new`-ed
      Grant: jest.fn().mockImplementation(function () {
        return { addOIDCScope, save }
      })
    })
    const h = /** @type {any} */ ({ abandon: Symbol('abandon') })
    const request = /** @type {any} */ ({ raw: { req: {}, res: {} } })

    const result = await handleInteractionEntry(provider, request, h)

    expect(provider.Grant).toHaveBeenCalledWith({
      accountId: 'user-1',
      clientId: 'runner'
    })
    expect(addOIDCScope).toHaveBeenCalledWith('openid email')
    expect(provider.interactionFinished).toHaveBeenCalledWith(
      request.raw.req,
      request.raw.res,
      { consent: { grantId: 'grant-123' } },
      { mergeWithLastSubmission: true }
    )
    expect(result).toBe(h.abandon)
  })

  it('redirects a login prompt to the façade UI (public issuer)', async () => {
    const provider = /** @type {any} */ ({
      interactionDetails: jest.fn().mockResolvedValue({
        uid: 'u9',
        prompt: { name: 'login' },
        params: {},
        session: undefined
      })
    })
    /** @type {string[]} */
    const redirects = []
    const request = /** @type {any} */ ({
      raw: {
        req: {},
        res: {
          writeHead: (
            /** @type {number} */ _code,
            /** @type {{ Location: string }} */ headers
          ) => redirects.push(headers.Location),
          end: () => undefined
        }
      }
    })
    const h = /** @type {any} */ ({ abandon: Symbol('abandon') })

    const result = await handleInteractionEntry(provider, request, h)

    expect(redirects[0]).toBe('http://localhost:3002/ui/interaction/u9')
    expect(result).toBe(h.abandon)
  })
})

describe('POST /otp/request', () => {
  it('requests an OTP with the uid and email from the payload', async () => {
    const otpService = /** @type {any} */ ({
      requestOtp: jest.fn().mockResolvedValue({})
    })
    const handler = findHandler(
      interactionRoutes(/** @type {any} */ ({}), otpService),
      'POST',
      '/otp/request'
    )
    const request = { payload: { uid: 'u1', email: 'a@b.com' } }

    const result = await handler(request)

    expect(otpService.requestOtp).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'a@b.com'
    })
    expect(result).toEqual({})
  })
})

describe('POST /interaction/{uid}/complete (verify + complete, atomic)', () => {
  /**
   * A raw req/res whose res records writeHead redirects, mirroring the
   * login-redirect test above.
   */
  function fakeRaw() {
    /** @type {{ code: number, Location: string }[]} */
    const redirects = []
    const req = {}
    const res = {
      writeHead: (
        /** @type {number} */ code,
        /** @type {{ Location: string }} */ headers
      ) => redirects.push({ code, ...headers }),
      end: () => undefined
    }
    return { req, res, redirects }
  }

  /**
   * @param {unknown} provider
   * @param {unknown} otpService
   */
  function completeHandler(provider, otpService) {
    return findHandler(
      interactionRoutes(
        /** @type {any} */ (provider),
        /** @type {any} */ (otpService)
      ),
      'POST',
      '/interaction/{uid}/complete'
    )
  }

  it('establishes the login only after a valid code, using the accountId from the store (never the wire)', async () => {
    // verifyOtp returns an opaque accountId unrelated to the wire email,
    // proving the handler authenticates with the stored value, not the
    // client-supplied one.
    const otpService = {
      verifyOtp: jest.fn().mockResolvedValue({ ok: true, accountId: 'user-1' })
    }
    const provider = {
      interactionFinished: jest.fn().mockResolvedValue(undefined)
    }
    const handler = completeHandler(provider, otpService)
    const { req, res } = fakeRaw()
    const request = {
      raw: { req, res },
      params: { uid: 'u1' },
      payload: { email: 'wire@b.com', code: '123456' }
    }
    const h = { abandon: Symbol('abandon') }

    const result = await handler(request, h)

    expect(otpService.verifyOtp).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'wire@b.com',
      code: '123456'
    })
    expect(provider.interactionFinished).toHaveBeenCalledWith(
      req,
      res,
      { login: { accountId: 'user-1' } },
      { mergeWithLastSubmission: false }
    )
    expect(result).toBe(h.abandon)
  })

  it('a wrong code never establishes a session — it redirects back to the code page', async () => {
    const otpService = { verifyOtp: jest.fn().mockResolvedValue({ ok: false }) }
    const provider = {
      interactionFinished: jest.fn().mockResolvedValue(undefined)
    }
    const handler = completeHandler(provider, otpService)
    const { req, res, redirects } = fakeRaw()
    const request = {
      raw: { req, res },
      params: { uid: 'u1' },
      payload: { email: 'a@b.com', code: '000000' }
    }
    const h = { abandon: Symbol('abandon') }

    const result = await handler(request, h)

    expect(provider.interactionFinished).not.toHaveBeenCalled()
    expect(redirects).toHaveLength(1)
    expect(redirects[0].code).toBe(302)
    expect(redirects[0].Location).toBe(
      'http://localhost:3002/ui/interaction/u1/verify?email=a%40b.com&error=1'
    )
    expect(result).toBe(h.abandon)
  })
})

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
