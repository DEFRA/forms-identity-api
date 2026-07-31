import Hapi from '@hapi/hapi'

import { oidcStoreRoutes } from '~/src/routes/oidc-store.js'

/** Builds a server around a fake store */
async function buildServer() {
  const store = {
    upsert: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue(undefined),
    findByUid: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    revokeByGrantId: jest.fn().mockResolvedValue(undefined)
  }
  const server = Hapi.server()
  server.route(oidcStoreRoutes(store))
  await server.initialize()
  return { server, store }
}

describe('oidc store routes', () => {
  it('PUT upserts payloads', async () => {
    const { server, store } = await buildServer()

    const res = await server.inject({
      method: 'PUT',
      url: '/oidc/session/id-1',
      payload: { payload: { uid: 'u-1' }, expiresIn: 60 }
    })

    expect(res.statusCode).toBe(204)
    expect(store.upsert).toHaveBeenCalledWith(
      'session',
      'id-1',
      { uid: 'u-1' },
      60
    )
  })

  it('GET returns the payload or 404', async () => {
    const { server, store } = await buildServer()
    store.find.mockResolvedValue({ a: 1 })

    const found = await server.inject({
      method: 'GET',
      url: '/oidc/grant/id-2'
    })
    expect(found.statusCode).toBe(200)
    expect(JSON.parse(found.payload)).toEqual({ a: 1 })

    store.find.mockResolvedValue(undefined)
    const missing = await server.inject({
      method: 'GET',
      url: '/oidc/grant/missing'
    })
    expect(missing.statusCode).toBe(404)
  })

  it('GET by uid resolves sessions', async () => {
    const { server, store } = await buildServer()
    store.findByUid.mockResolvedValue({ uid: 'u-9' })

    const res = await server.inject({
      method: 'GET',
      url: '/oidc/session/uid/u-9'
    })

    expect(res.statusCode).toBe(200)
    expect(store.findByUid).toHaveBeenCalledWith('session', 'u-9')
  })

  it('consume, destroy and grant revocation return 204', async () => {
    const { server, store } = await buildServer()

    const consume = await server.inject({
      method: 'POST',
      url: '/oidc/authorization_code/id-3/consume'
    })
    expect(consume.statusCode).toBe(204)
    expect(store.consume).toHaveBeenCalledWith('authorization_code', 'id-3')

    const destroy = await server.inject({
      method: 'DELETE',
      url: '/oidc/session/id-4'
    })
    expect(destroy.statusCode).toBe(204)
    expect(store.destroy).toHaveBeenCalledWith('session', 'id-4')

    const revoke = await server.inject({
      method: 'DELETE',
      url: '/oidc/grants/grant-1'
    })
    expect(revoke.statusCode).toBe(204)
    expect(store.revokeByGrantId).toHaveBeenCalledWith('grant-1')
  })

  it('rejects model names outside the allowlist', async () => {
    const { server, store } = await buildServer()

    const res = await server.inject({
      method: 'GET',
      url: '/oidc/accounts/id-1'
    })

    expect(res.statusCode).toBe(400)
    expect(store.find).not.toHaveBeenCalled()
  })
})
