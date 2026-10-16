import { OTP_LOCKOUTS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { incrementRequests } from '~/src/repositories/otp-lockouts-repository.js'
import { setupIntegrationDb } from '~/test/helpers/mongo-memory.js'

setupIntegrationDb()

/** Requests in flight together for one address */
const REQUESTS_PER_TARGET = 10

/** Addresses raced at once, to give the insert race many chances to occur */
const TARGETS = 20

describe('otp lockouts repository', () => {
  it('counts every request when first requests for an address race', async () => {
    // Every request for a fresh address starts on the insert path, and all but
    // one lose to the unique index. The repository does not catch that: it
    // relies on MongoDB retrying the upsert on the server, so each request
    // must still resolve to its own count rather than reject with E11000.
    const now = new Date()
    const targets = Array.from(
      { length: TARGETS },
      (_, i) => `race-${i}@example.com`
    )

    const counters = await Promise.all(
      targets.map((target) =>
        Promise.all(
          Array.from({ length: REQUESTS_PER_TARGET }, () =>
            incrementRequests(
              { target },
              { expireAt: now },
              { windowStartedAt: now, lockedUntil: null }
            )
          )
        )
      )
    )

    const expectedCounts = Array.from(
      { length: REQUESTS_PER_TARGET },
      (_, i) => i + 1
    )

    for (const [i, target] of targets.entries()) {
      expect(
        counters[i].map(({ requests }) => requests).sort((a, b) => a - b)
      ).toEqual(expectedCounts)
      await expect(
        db.collection(OTP_LOCKOUTS_COLLECTION_NAME).countDocuments({ target })
      ).resolves.toBe(1)
    }
  })
})
