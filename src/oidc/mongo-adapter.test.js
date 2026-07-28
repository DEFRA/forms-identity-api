import { buildMockCollection } from '~/src/__stubs__/mongo.js'
import { makeMongoAdapter } from '~/src/oidc/mongo-adapter.js'

describe('mongo adapter', () => {
  /** @type {Map<string, ReturnType<typeof buildMockCollection>>} */
  let collections
  /** @type {import('mongodb').Db} */
  let db
  /** @type {ReturnType<typeof makeMongoAdapter>} */
  let Adapter

  /**
   * Returns (creating on demand) the mock collection for a name
   * @param {string} name
   */
  function collection(name) {
    let coll = collections.get(name)
    if (!coll) {
      coll = buildMockCollection()
      collections.set(name, coll)
    }
    return coll
  }

  beforeEach(() => {
    collections = new Map()
    db = /** @type {import('mongodb').Db} */ (
      /** @type {unknown} */ ({
        collection: (/** @type {string} */ name) => collection(name)
      })
    )
    Adapter = makeMongoAdapter(db)
  })

  it('snake_cases the model name into the collection name', () => {
    const adapter = new Adapter('AuthorizationCode')

    expect(
      /** @type {{ name: string }} */ (/** @type {unknown} */ (adapter)).name
    ).toBe('authorization_code')
    expect(collections.has('authorization_code')).toBe(true)
  })

  describe('upsert', () => {
    it('upserts the payload under the string id with a TTL expireAt date', async () => {
      const adapter = new Adapter('Session')
      const before = Date.now()

      await adapter.upsert('s1', { uid: 'uid-1' }, 60)

      const [filter, update, options] =
        collection('session').updateOne.mock.calls[0]
      expect(filter).toEqual({ _id: 's1' })
      expect(options).toEqual({ upsert: true })
      const $set = /** @type {{ $set: { uid: string, expireAt: Date } }} */ (
        update
      ).$set
      expect($set.uid).toBe('uid-1')
      expect($set.expireAt.getTime()).toBeGreaterThanOrEqual(before + 60_000)
      expect($set.expireAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000)
    })

    it('omits expireAt when no expiry is given', async () => {
      const adapter = new Adapter('Grant')

      await adapter.upsert('g1', { accountId: 'a1' }, 0)

      expect(collection('grant').updateOne).toHaveBeenCalledWith(
        { _id: 'g1' },
        { $set: { accountId: 'a1' } },
        { upsert: true }
      )
    })
  })

  describe('find', () => {
    it('finds by id and strips the storage fields (_id, expireAt)', async () => {
      collection('interaction').findOne.mockResolvedValue({
        _id: 'i1',
        expireAt: new Date(),
        uid: 'uid-1',
        kind: 'Interaction'
      })
      const adapter = new Adapter('Interaction')

      const result = await adapter.find('i1')

      expect(collection('interaction').findOne).toHaveBeenCalledWith({
        _id: 'i1'
      })
      expect(result).toEqual({ uid: 'uid-1', kind: 'Interaction' })
    })

    it('returns undefined when not found', async () => {
      collection('interaction').findOne.mockResolvedValue(null)
      const adapter = new Adapter('Interaction')

      expect(await adapter.find('missing')).toBeUndefined()
    })
  })

  it('finds sessions by uid', async () => {
    collection('session').findOne.mockResolvedValue({
      _id: 's1',
      uid: 'uid-1',
      accountId: 'a1'
    })
    const adapter = new Adapter('Session')

    const result = await adapter.findByUid('uid-1')

    expect(collection('session').findOne).toHaveBeenCalledWith({ uid: 'uid-1' })
    expect(result).toEqual({ uid: 'uid-1', accountId: 'a1' })
  })

  it('finds device codes by userCode', async () => {
    collection('device_code').findOne.mockResolvedValue({
      _id: 'd1',
      userCode: 'ABCD-EFGH'
    })
    const adapter = new Adapter('DeviceCode')

    const result = await adapter.findByUserCode('ABCD-EFGH')

    expect(collection('device_code').findOne).toHaveBeenCalledWith({
      userCode: 'ABCD-EFGH'
    })
    expect(result).toEqual({ userCode: 'ABCD-EFGH' })
  })

  it('consumes a payload by stamping the consumed epoch', async () => {
    const adapter = new Adapter('AuthorizationCode')
    const before = Math.floor(Date.now() / 1000)

    await adapter.consume('c1')

    const [filter, update] =
      collection('authorization_code').updateOne.mock.calls[0]
    expect(filter).toEqual({ _id: 'c1' })
    const consumed = /** @type {{ $set: { consumed: number } }} */ (update).$set
      .consumed
    expect(consumed).toBeGreaterThanOrEqual(before)
    expect(consumed).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000))
  })

  it('destroys a payload by id', async () => {
    const adapter = new Adapter('Session')

    await adapter.destroy('s1')

    expect(collection('session').deleteOne).toHaveBeenCalledWith({ _id: 's1' })
  })

  it('revokes every grantable artifact issued under a grant', async () => {
    const adapter = new Adapter('Grant')

    await adapter.revokeByGrantId('grant-1')

    for (const name of [
      'access_token',
      'authorization_code',
      'refresh_token',
      'device_code',
      'backchannel_authentication_request'
    ]) {
      expect(collection(name).deleteMany).toHaveBeenCalledWith({
        grantId: 'grant-1'
      })
    }
  })
})
