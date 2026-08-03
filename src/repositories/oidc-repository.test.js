import { db } from '~/src/mongo.js'
import {
  consume,
  destroy,
  find,
  findByUid,
  revokeByGrantId,
  upsert
} from '~/src/repositories/oidc-repository.js'

jest.mock('~/src/mongo.js', () => ({
  GRANTABLE_COLLECTION_NAMES: ['access_token', 'authorization_code'],
  db: { collection: jest.fn() }
}))

/**
 * In-memory collection. Documents are stored under `_id`; lookups by nested
 * key (payload.uid) walk the stored docs.
 */
function memoryColl() {
  /** @type {Map<string, any>} */
  const map = new Map()
  return {
    map,
    updateOne: jest.fn(
      (
        /** @type {{ _id: string }} */ filter,
        /** @type {{ $set?: Record<string, unknown> }} */ update,
        /** @type {{ upsert?: boolean } | undefined} */ options
      ) => {
        const existing = map.get(filter._id) ?? { _id: filter._id }
        if (options?.upsert || map.has(filter._id)) {
          const next = { ...existing }
          for (const [key, value] of Object.entries(update.$set ?? {})) {
            // support dotted keys (e.g. payload.consumed)
            if (key.includes('.')) {
              const [head, tail] = key.split('.')
              next[head] = { ...next[head], [tail]: value }
            } else {
              next[key] = value
            }
          }
          map.set(filter._id, next)
        }
        return Promise.resolve({})
      }
    ),
    findOne: jest.fn((/** @type {Record<string, string>} */ filter) => {
      if ('_id' in filter) {
        return Promise.resolve(map.get(filter._id) ?? null)
      }
      const hit = [...map.values()].find(
        (d) => d.payload?.uid === filter['payload.uid']
      )
      return Promise.resolve(hit ?? null)
    }),
    deleteOne: jest.fn((/** @type {{ _id: string }} */ filter) => {
      map.delete(filter._id)
      return Promise.resolve({})
    }),
    deleteMany: jest.fn(() => Promise.resolve({}))
  }
}

/** Wires a per-collection-name registry into the mocked db */
function build() {
  /** @type {Record<string, ReturnType<typeof memoryColl>>} */
  const colls = {}
  jest.mocked(db.collection).mockImplementation((name) => {
    colls[name] ??= memoryColl()
    return /** @type {never} */ (colls[name])
  })
  return colls
}

describe('oidc store', () => {
  it('upsert nests the payload under a payload field with a computed expireAt', async () => {
    const colls = build()

    await upsert('session', 'id-1', { uid: 'u-1', foo: 'bar' }, 60)

    const doc = /** @type {Record<string, any>} */ (
      colls.session.map.get('id-1')
    )
    expect(doc.payload).toEqual({ uid: 'u-1', foo: 'bar' })
    expect(doc.expireAt).toBeInstanceOf(Date)
    expect(/** @type {Date} */ (doc.expireAt).getTime()).toBeGreaterThan(
      Date.now()
    )
  })

  it('find returns exactly the payload, and throws notFound when missing', async () => {
    build()
    await upsert('grant', 'id-2', { a: 1 }, 60)

    await expect(find('grant', 'id-2')).resolves.toEqual({ a: 1 })
    await expect(find('grant', 'missing')).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 404 }
    })
  })

  it('findByUid resolves sessions by the nested uid, throws notFound otherwise', async () => {
    build()
    await upsert('session', 'id-3', { uid: 'u-9', b: 2 }, 60)

    await expect(findByUid('session', 'u-9')).resolves.toEqual({
      uid: 'u-9',
      b: 2
    })
    await expect(findByUid('session', 'nope')).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 404 }
    })
  })

  it('consume stamps a consumed epoch inside the payload', async () => {
    const colls = build()
    await upsert('authorization_code', 'id-4', { c: 3 }, 60)

    await consume('authorization_code', 'id-4')

    expect(colls.authorization_code.map.get('id-4')?.payload.consumed).toEqual(
      expect.any(Number)
    )
  })

  it('destroy deletes and revokeByGrantId sweeps grantables by nested grantId', async () => {
    const colls = build()
    await upsert('session', 'id-5', {}, 60)

    await destroy('session', 'id-5')
    expect(colls.session.map.has('id-5')).toBe(false)

    await revokeByGrantId('grant-1')
    expect(colls.access_token.deleteMany).toHaveBeenCalledWith({
      'payload.grantId': 'grant-1'
    })
  })
})
