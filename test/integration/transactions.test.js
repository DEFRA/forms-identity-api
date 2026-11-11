import { AuditEventMessageType } from '@defra/forms-model'

import { PURPOSE } from '~/src/constants.js'
import { publishEvent } from '~/src/messaging/publish-base.js'
import {
  ACCOUNTS_COLLECTION_NAME,
  OTPS_COLLECTION_NAME,
  OTP_LOCKOUTS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'
import { clear } from '~/src/repositories/otp-lockouts-repository.js'
import { createAccount } from '~/src/services/signin-service.js'
import { setupSigninFlow } from '~/test/helpers/signin-flow.js'

jest.mock('~/src/lib/notify.js', () => ({ sendEmail: jest.fn() }))
jest.mock('~/src/messaging/publish-base.js')
// The lockout counter is the last write of each transaction below, so making
// `clear` fail is a failure after every other write has already been made
jest.mock('~/src/repositories/otp-lockouts-repository.js', () => ({
  ...jest.requireActual('~/src/repositories/otp-lockouts-repository.js'),
  clear: jest.fn()
}))

const { inject, requestCode, verify } = setupSigninFlow()

const actualClear = jest.requireActual(
  '~/src/repositories/otp-lockouts-repository.js'
).clear

/**
 * The audit events of one type that were published
 * @param {AuditMessage['type']} type
 */
function published(type) {
  return jest
    .mocked(publishEvent)
    .mock.calls.filter(([message]) => message.type === type)
}

/**
 * @param {string} uid
 * @param {string} phone
 */
function completeSignup(uid, phone = '07911 123456') {
  return inject({ method: 'POST', url: '/accounts', payload: { uid, phone } })
}

/**
 * @param {string} collection
 * @param {Record<string, unknown>} filter
 */
function count(collection, filter = {}) {
  return db.collection(collection).countDocuments(filter)
}

beforeEach(() => {
  jest.mocked(clear).mockImplementation(actualClear)
})

describe('transactions', () => {
  describe('completing a signup', () => {
    it('leaves nothing behind when a write fails after the others succeeded', async () => {
      const code = await requestCode('uid-rollback')
      await verify('uid-rollback', code)
      jest.mocked(clear).mockRejectedValueOnce(new Error('clear failed'))

      const failed = await completeSignup('uid-rollback')

      expect(failed.statusCode).toBe(500)
      // the account and the spent code were written before the failure
      await expect(count(ACCOUNTS_COLLECTION_NAME)).resolves.toBe(0)
      await expect(
        db.collection(OTPS_COLLECTION_NAME).findOne({ uid: 'uid-rollback' })
      ).resolves.toMatchObject({ verified: true, consumed: false })
      await expect(count(OTP_LOCKOUTS_COLLECTION_NAME)).resolves.toBe(1)
      expect(published(AuditEventMessageType.IDENTITY_REGISTRATION)).toEqual([])
      expect(
        published(AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL)
      ).toEqual([])

      // the code was not spent, so the citizen can try again
      const retried = await completeSignup('uid-rollback')

      expect(JSON.parse(retried.payload)).toMatchObject({
        status: 'signed-in'
      })
      await expect(count(ACCOUNTS_COLLECTION_NAME)).resolves.toBe(1)
      await expect(
        db.collection(OTPS_COLLECTION_NAME).findOne({ uid: 'uid-rollback' })
      ).resolves.toMatchObject({ consumed: true })
      await expect(count(OTP_LOCKOUTS_COLLECTION_NAME)).resolves.toBe(0)
    })

    it('signs two interactions racing for one email into the same single account', async () => {
      for (const uid of ['uid-race-a', 'uid-race-b']) {
        const code = await requestCode(uid, 'race@example.com')
        await verify(uid, code)
      }

      const responses = await Promise.all([
        completeSignup('uid-race-a'),
        completeSignup('uid-race-b')
      ])

      const results = responses.map((res) => JSON.parse(res.payload))
      expect(results.map((result) => result.status)).toEqual([
        'signed-in',
        'signed-in'
      ])
      expect(results[0].accountId).toBe(results[1].accountId)
      await expect(
        count(ACCOUNTS_COLLECTION_NAME, { email: 'race@example.com' })
      ).resolves.toBe(1)
      await expect(
        count(OTPS_COLLECTION_NAME, { consumed: true })
      ).resolves.toBe(2)
      // only the signup that made the account registered it
      expect(
        published(AuditEventMessageType.IDENTITY_REGISTRATION)
      ).toHaveLength(1)
      expect(
        published(AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL)
      ).toHaveLength(2)
    })

    it('lets only one of two submissions of the same interaction through', async () => {
      const code = await requestCode('uid-double')
      await verify('uid-double', code)

      const responses = await Promise.all([
        completeSignup('uid-double'),
        completeSignup('uid-double')
      ])

      const statuses = responses
        .map((res) => JSON.parse(res.payload).status)
        .sort()
      expect(statuses).toEqual(['invalid', 'signed-in'])
      await expect(count(ACCOUNTS_COLLECTION_NAME)).resolves.toBe(1)
      expect(
        published(AuditEventMessageType.IDENTITY_REGISTRATION)
      ).toHaveLength(1)
    })
  })

  describe('changing a phone number', () => {
    it('leaves the account and the code untouched when a write fails', async () => {
      const account = await createAccount(
        'citizen@example.com',
        '+447500111111'
      )
      await db.collection(OTPS_COLLECTION_NAME).insertOne({
        uid: 'uid-phone',
        purpose: PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL,
        target: 'citizen@example.com',
        accountId: account._id,
        codeHash: 'not-checked-here',
        attempts: 0,
        verified: true,
        consumed: false,
        createdAt: new Date(),
        expireAt: new Date(Date.now() + 60_000)
      })
      const url = `/accounts/uid-phone/${account._id}/phone`
      const payload = { phone: '07911 123456' }
      const accountInDb = () =>
        db
          .collection(ACCOUNTS_COLLECTION_NAME)
          .findOne({ _id: /** @type {never} */ (account._id) })
      jest.mocked(clear).mockRejectedValueOnce(new Error('clear failed'))

      const failed = await inject({ method: 'PATCH', url, payload })

      expect(failed.statusCode).toBe(500)
      await expect(accountInDb()).resolves.toMatchObject({
        phone: '+447500111111'
      })
      await expect(
        db.collection(OTPS_COLLECTION_NAME).findOne({ uid: 'uid-phone' })
      ).resolves.toMatchObject({ consumed: false })
      expect(
        published(AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED)
      ).toEqual([])

      const retried = await inject({ method: 'PATCH', url, payload })

      expect(JSON.parse(retried.payload)).toEqual({ status: 'valid' })
      await expect(accountInDb()).resolves.toMatchObject({
        phone: '+447911123456'
      })
      await expect(
        db.collection(OTPS_COLLECTION_NAME).findOne({ uid: 'uid-phone' })
      ).resolves.toMatchObject({ consumed: true })
      expect(
        published(AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED)
      ).toHaveLength(1)
    })
  })
})

/**
 * @import { AuditMessage } from '@defra/forms-model'
 */
