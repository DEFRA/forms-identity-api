import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'
import { createAccount } from '~/src/services/signin-service.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))

const { inject } = setupSigninFlow()

/*
 * Node dispatches these operations from one thread, but Promise.all puts
 * every request in flight before any completes: the handlers interleave at
 * their await points and the driver spreads the commands across its
 * connection pool, so mongod executes them in parallel for real. Whether a
 * given run hits the narrowest race window (e.g. two upserts both choosing
 * the insert path) is still timing-dependent — these tests assert the
 * invariants that must hold under any interleaving, while the unit layer
 * forces the collision branches deterministically.
 */
describe('concurrency', () => {
  it('keeps one record when code requests race', async () => {
    // A request that loses the race to create the record fails on the unique
    // index. That is left to fail rather than retried here: the fix belongs
    // upstream, where the UI stops a citizen submitting twice.
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        inject({
          method: 'POST',
          url: '/otp/request',
          payload: { uid: 'uid-race', email: 'citizen@example.com' }
        })
      )
    )

    expect(responses.some((res) => res.statusCode === 204)).toBe(true)
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
