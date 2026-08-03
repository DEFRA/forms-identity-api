import Hapi from '@hapi/hapi'

import {
  consume,
  destroy,
  find,
  findByUid,
  revokeByGrantId,
  upsert
} from '~/src/repositories/oidc-repository.js'
import oidcStoreRoutes from '~/src/routes/oidc-store.js'

jest.mock('~/src/repositories/oidc-repository.js', () => ({
  MODEL_COLLECTIONS: [
    'session',
    'access_token',
    'authorization_code',
    'grant',
    'interaction'
  ],
  upsert: jest.fn(),
  find: jest.fn(),
  findByUid: jest.fn(),
  consume: jest.fn(),
  destroy: jest.fn(),
  revokeByGrantId: jest.fn()
}))

/** Builds a server with the static routes (store is module-mocked) */
async function buildServer() {
  const server = Hapi.server()
  server.route(oidcStoreRoutes)
  await server.initialize()
  return server
}

describe('oidc store routes', () => {
  it('PUT upserts payloads', async () => {
    jest.mocked(upsert).mockResolvedValue(undefined)
    const server = await buildServer()

    const res = await server.inject({
      method: 'PUT',
      url: '/oidc/session/id-1',
      payload: { payload: { uid: 'u-1' }, expiresIn: 60 }
    })

    expect(res.statusCode).toBe(204)
    expect(upsert).toHaveBeenCalledWith('session', 'id-1', { uid: 'u-1' }, 60)
  })

  it('GET returns the payload or 404', async () => {
    jest.mocked(find).mockResolvedValue({ a: 1 })
    const server = await buildServer()

    const found = await server.inject({
      method: 'GET',
      url: '/oidc/grant/id-2'
    })
    expect(found.statusCode).toBe(200)
    expect(JSON.parse(found.payload)).toEqual({ a: 1 })

    jest.mocked(find).mockResolvedValue(undefined)
    const missing = await server.inject({
      method: 'GET',
      url: '/oidc/grant/missing'
    })
    expect(missing.statusCode).toBe(404)
  })

  it('GET by uid resolves sessions', async () => {
    jest.mocked(findByUid).mockResolvedValue({ uid: 'u-9' })
    const server = await buildServer()

    const res = await server.inject({
      method: 'GET',
      url: '/oidc/session/uid/u-9'
    })

    expect(res.statusCode).toBe(200)
    expect(findByUid).toHaveBeenCalledWith('session', 'u-9')
  })

  it('consume, destroy and grant revocation return 204', async () => {
    jest.mocked(consume).mockResolvedValue(undefined)
    jest.mocked(destroy).mockResolvedValue(undefined)
    jest.mocked(revokeByGrantId).mockResolvedValue(undefined)
    const server = await buildServer()

    const consumeRes = await server.inject({
      method: 'POST',
      url: '/oidc/authorization_code/id-3/consume'
    })
    expect(consumeRes.statusCode).toBe(204)
    expect(consume).toHaveBeenCalledWith('authorization_code', 'id-3')

    const destroyRes = await server.inject({
      method: 'DELETE',
      url: '/oidc/session/id-4'
    })
    expect(destroyRes.statusCode).toBe(204)
    expect(destroy).toHaveBeenCalledWith('session', 'id-4')

    const revokeRes = await server.inject({
      method: 'DELETE',
      url: '/oidc/grants/grant-1'
    })
    expect(revokeRes.statusCode).toBe(204)
    expect(revokeByGrantId).toHaveBeenCalledWith('grant-1')
  })

  it('rejects model names outside the allowlist', async () => {
    const server = await buildServer()

    const res = await server.inject({
      method: 'GET',
      url: '/oidc/accounts/id-1'
    })

    expect(res.statusCode).toBe(400)
    expect(find).not.toHaveBeenCalled()
  })
})
