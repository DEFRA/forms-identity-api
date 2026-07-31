import { makeAccountsService } from '~/src/signin/accounts-service.js'

/** Builds a fake accounts collection */
function fakeColl() {
  return {
    findOne: jest.fn(),
    insertOne: jest.fn()
  }
}

/** @param {ReturnType<typeof fakeColl>} coll */
function service(coll) {
  const db = /** @type {import('mongodb').Db} */ (
    /** @type {unknown} */ ({ collection: () => coll })
  )
  return makeAccountsService(db)
}

describe('accounts service', () => {
  it('findByEmail lowercases the email', async () => {
    const coll = fakeColl()
    coll.findOne.mockResolvedValue(null)

    await service(coll).findByEmail('Citizen@Example.COM')

    expect(coll.findOne).toHaveBeenCalledWith({
      email: 'citizen@example.com'
    })
  })

  it('createAccount inserts a full account document', async () => {
    const coll = fakeColl()
    coll.insertOne.mockResolvedValue({ acknowledged: true })

    const account = await service(coll).createAccount({
      email: 'Citizen@Example.com',
      phone: '+447911123456'
    })

    expect(coll.insertOne).toHaveBeenCalledWith(account)
    expect(account).toEqual({
      _id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email: 'citizen@example.com',
      emailVerified: true,
      phone: '+447911123456',
      phoneVerified: false,
      status: 'active',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date)
    })
  })

  it('createAccount returns the existing account on duplicate email', async () => {
    const coll = fakeColl()
    const existing = { _id: 'abc', email: 'citizen@example.com' }
    const dup = Object.assign(new Error('E11000'), { code: 11000 })
    coll.insertOne.mockRejectedValue(dup)
    coll.findOne.mockResolvedValue(existing)

    const account = await service(coll).createAccount({
      email: 'citizen@example.com',
      phone: '+447911123456'
    })

    expect(account).toBe(existing)
  })

  it('createAccount rethrows non-duplicate errors', async () => {
    const coll = fakeColl()
    coll.insertOne.mockRejectedValue(new Error('boom'))

    await expect(
      service(coll).createAccount({
        email: 'citizen@example.com',
        phone: '+447911123456'
      })
    ).rejects.toThrow('boom')
  })
})
