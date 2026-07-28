import { buildMockCollection } from '~/src/__stubs__/mongo.js'
import { findUserById, upsertUserByEmail } from '~/src/users/user-service.js'

const mockCollection = buildMockCollection()

jest.mock('~/src/mongo.js', () => ({
  USERS_COLLECTION_NAME: 'users',
  db: {
    collection() {
      return mockCollection
    }
  }
}))

describe('user service', () => {
  const user = {
    _id: 'f1f2f3f4-0000-4000-8000-000000000001',
    email: 'a@b.com',
    createdAt: new Date('2026-01-01'),
    lastSignedInAt: new Date('2026-07-27')
  }

  describe('upsertUserByEmail', () => {
    it('upserts by email, minting an opaque id on insert, and returns the user', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue(user)

      const result = await upsertUserByEmail('a@b.com')

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'a@b.com' },
        {
          $setOnInsert: {
            _id: expect.any(String),
            email: 'a@b.com',
            createdAt: expect.any(Date)
          },
          $set: { lastSignedInAt: expect.any(Date) }
        },
        { upsert: true, returnDocument: 'after' }
      )
      expect(result).toEqual(user)
    })

    it('mints a UUID as the opaque id (never the email)', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue(user)

      await upsertUserByEmail('a@b.com')

      const update = mockCollection.findOneAndUpdate.mock.calls[0][1]
      const insertedId = /** @type {{ $setOnInsert: { _id: string } }} */ (
        update
      ).$setOnInsert._id
      expect(insertedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
      expect(insertedId).not.toContain('@')
    })

    it('fails loud (without leaking the email) when the upsert returns nothing', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue(null)

      await expect(upsertUserByEmail('a@b.com')).rejects.toThrow(
        'Failed to upsert user'
      )
    })
  })

  describe('findUserById', () => {
    it('finds a user by opaque id', async () => {
      mockCollection.findOne.mockResolvedValue(user)

      const result = await findUserById(user._id)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: user._id })
      expect(result).toEqual(user)
    })

    it('returns null when the user does not exist', async () => {
      mockCollection.findOne.mockResolvedValue(null)

      expect(await findUserById('missing')).toBeNull()
    })
  })
})
