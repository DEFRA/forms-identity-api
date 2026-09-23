import { OIDC_COLLECTION_NAMES, db } from '~/src/mongo.js'
import {
  consume,
  destroy,
  find,
  findByUid,
  revokeByGrantId,
  upsert
} from '~/src/repositories/oidc-repository.js'
import { setupIntegrationDb } from '~/test/helpers/mongo-memory.js'

setupIntegrationDb()

afterEach(() =>
  Promise.all(
    OIDC_COLLECTION_NAMES.map((name) => db.collection(name).deleteMany({}))
  )
)

/**
 * The stored document for an artifact id
 * @param {string} model
 * @param {string} id
 */
function stored(model, id) {
  return db.collection(model).findOne({ _id: /** @type {never} */ (id) })
}

describe('oidc store', () => {
  it('nests the payload under a payload field with a computed expireAt', async () => {
    await upsert('session', 'id-1', { uid: 'u-1', foo: 'bar' }, 60)

    const doc = await stored('session', 'id-1')
    expect(doc?.payload).toEqual({ uid: 'u-1', foo: 'bar' })
    expect(doc?.expireAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('find returns exactly the payload, and null when missing', async () => {
    await upsert('grant', 'id-2', { a: 1 }, 60)

    await expect(find('grant', 'id-2')).resolves.toEqual({ a: 1 })
    await expect(find('grant', 'missing')).resolves.toBeNull()
  })

  it('findByUid resolves sessions by the nested uid, null otherwise', async () => {
    await upsert('session', 'id-3', { uid: 'u-9', b: 2 }, 60)

    await expect(findByUid('session', 'u-9')).resolves.toEqual({
      uid: 'u-9',
      b: 2
    })
    await expect(findByUid('session', 'nope')).resolves.toBeNull()
  })

  it('a re-upsert without expiresIn clears a previously set expiry', async () => {
    // oidc-provider owns expiry; when it stops sending one, a leftover
    // expireAt would let the TTL sweeper delete a live artifact
    await upsert('session', 'id-4', { uid: 'u-1' }, 60)
    await upsert('session', 'id-4', { uid: 'u-1' })

    const doc = await stored('session', 'id-4')
    expect(doc?.payload).toEqual({ uid: 'u-1' })
    expect(doc?.expireAt).toBeUndefined()
  })

  it('consume stamps a consumed epoch inside the payload', async () => {
    await upsert('authorization_code', 'id-5', { c: 3 }, 60)

    await consume('authorization_code', 'id-5')

    const doc = await stored('authorization_code', 'id-5')
    expect(doc?.payload).toEqual({ c: 3, consumed: expect.any(Number) })
  })

  it('destroy deletes the artifact', async () => {
    await upsert('session', 'id-6', {}, 60)

    await destroy('session', 'id-6')

    await expect(stored('session', 'id-6')).resolves.toBeNull()
  })

  it('stores, consumes and destroys refresh tokens', async () => {
    // the provider marks a refresh token consumed when it replaces it, and
    // reads it back to refuse (and revoke the grant on) a second use
    await upsert('refresh_token', 'r-1', { grantId: 'g-1', kind: 'x' }, 60)

    await expect(find('refresh_token', 'r-1')).resolves.toEqual({
      grantId: 'g-1',
      kind: 'x'
    })

    await consume('refresh_token', 'r-1')

    await expect(find('refresh_token', 'r-1')).resolves.toEqual({
      grantId: 'g-1',
      kind: 'x',
      consumed: expect.any(Number)
    })

    await destroy('refresh_token', 'r-1')

    await expect(stored('refresh_token', 'r-1')).resolves.toBeNull()
  })

  it('revokeByGrantId sweeps only grantable artifacts of that grant', async () => {
    await upsert('access_token', 't-1', { grantId: 'g-1' }, 60)
    await upsert('authorization_code', 'c-1', { grantId: 'g-1' }, 60)
    await upsert('refresh_token', 'r-1', { grantId: 'g-1' }, 60)
    await upsert('access_token', 't-2', { grantId: 'g-2' }, 60)
    await upsert('refresh_token', 'r-2', { grantId: 'g-2' }, 60)
    await upsert('session', 's-1', { grantId: 'g-1' }, 60)

    await revokeByGrantId('g-1')

    await expect(stored('access_token', 't-1')).resolves.toBeNull()
    await expect(stored('authorization_code', 'c-1')).resolves.toBeNull()
    await expect(stored('refresh_token', 'r-1')).resolves.toBeNull()
    // other grants and non-grantable models are untouched
    await expect(stored('access_token', 't-2')).resolves.not.toBeNull()
    await expect(stored('refresh_token', 'r-2')).resolves.not.toBeNull()
    await expect(stored('session', 's-1')).resolves.not.toBeNull()
  })
})
