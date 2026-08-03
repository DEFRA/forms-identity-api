import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'
import { createAccount } from '~/src/services/signin-service.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const { inject } = setupSigninFlow()

describe('concurrency (the guarantees only real Mongo can prove)', () => {
  it('handles concurrent code requests without crashing, keeping one record', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        inject({
          method: 'POST',
          url: '/otp/request',
          payload: { uid: 'uid-race', email: 'citizen@example.com' }
        })
      )
    )

    for (const res of responses) {
      expect(res.statusCode).toBe(204)
    }
    await expect(
      db.collection(OTPS_COLLECTION_NAME).countDocuments({ uid: 'uid-race' })
    ).resolves.toBe(1)
  })

  it('yields a single account when concurrent signups race on one email', async () => {
    // the unique email index rejects the losing insert with a real E11000,
    // which createAccount resolves to the winner's account
    const [a, b] = await Promise.all([
      createAccount('race@example.com', '+447911123456'),
      createAccount('race@example.com', '+447911123456')
    ])

    expect(a._id).toBe(b._id)
    await expect(
      db
        .collection(ACCOUNTS_COLLECTION_NAME)
        .countDocuments({ email: 'race@example.com' })
    ).resolves.toBe(1)
  })
})
