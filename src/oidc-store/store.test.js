import { makeOidcStore } from '~/src/oidc-store/store.js'

/** In-memory collection covering the store's operations */
function memoryColl() {
  /** @type {Map<string, Record<string, unknown>>} */
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
          map.set(filter._id, { ...existing, ...(update.$set ?? {}) })
        }
        return Promise.resolve({})
      }
    ),
    findOne: jest.fn((/** @type {Record<string, string>} */ filter) => {
      if ('_id' in filter) {
        return Promise.resolve(map.get(filter._id) ?? null)
      }
      const hit = [...map.values()].find((d) => d.uid === filter.uid)
      return Promise.resolve(hit ?? null)
    }),
    deleteOne: jest.fn((/** @type {{ _id: string }} */ filter) => {
      map.delete(filter._id)
      return Promise.resolve({})
    }),
    deleteMany: jest.fn(() => Promise.resolve({}))
  }
}

/** Builds a store over one shared fake collection registry */
function build() {
  /** @type {Record<string, ReturnType<typeof memoryColl>>} */
  const colls = {}
  const db = /** @type {import('mongodb').Db} */ (
    /** @type {unknown} */ ({
      /** @param {string} name */
      collection(name) {
        colls[name] ??= memoryColl()
        return colls[name]
      }
    })
  )
  return { store: makeOidcStore(db), colls }
}

describe('oidc store', () => {
  it('upsert stores the payload with a computed expireAt', async () => {
    const { store, colls } = build()

    await store.upsert('session', 'id-1', { uid: 'u-1', foo: 'bar' }, 60)

    const doc = /** @type {Record<string, unknown>} */ (
      colls.session.map.get('id-1')
    )
    expect(doc.foo).toBe('bar')
    expect(doc.uid).toBe('u-1')
    expect(doc.expireAt).toBeInstanceOf(Date)
    expect(/** @type {Date} */ (doc.expireAt).getTime()).toBeGreaterThan(
      Date.now()
    )
  })

  it('find strips storage fields and returns undefined when missing', async () => {
    const { store } = build()
    await store.upsert('grant', 'id-2', { a: 1 }, 60)

    const found = await store.find('grant', 'id-2')
    expect(found).toEqual({ a: 1 })

    await expect(store.find('grant', 'missing')).resolves.toBeUndefined()
  })

  it('findByUid resolves sessions by uid', async () => {
    const { store } = build()
    await store.upsert('session', 'id-3', { uid: 'u-9', b: 2 }, 60)

    await expect(store.findByUid('session', 'u-9')).resolves.toEqual({
      uid: 'u-9',
      b: 2
    })
  })

  it('consume stamps a consumed epoch', async () => {
    const { store, colls } = build()
    await store.upsert('authorization_code', 'id-4', { c: 3 }, 60)

    await store.consume('authorization_code', 'id-4')

    expect(colls.authorization_code.map.get('id-4')?.consumed).toEqual(
      expect.any(Number)
    )
  })

  it('destroy deletes and revokeByGrantId sweeps grantables', async () => {
    const { store, colls } = build()
    await store.upsert('session', 'id-5', {}, 60)

    await store.destroy('session', 'id-5')
    expect(colls.session.map.has('id-5')).toBe(false)

    await store.revokeByGrantId('grant-1')
    expect(colls.access_token.deleteMany).toHaveBeenCalledWith({
      grantId: 'grant-1'
    })
  })
})
