import {
  AuditEventMessageCategory,
  AuditEventMessageSchemaVersion,
  AuditEventMessageSource,
  AuditEventMessageType
} from '@defra/forms-model'

import { publishEvent } from '~/src/messaging/publish-base.js'
import {
  publishAccountDeletionEvent,
  publishEmailAddressUpdatedEvent,
  publishIncorrectCodeEnteredEvent,
  publishIncorrectCodeLockoutEvent,
  publishPhoneNumberUpdatedEvent,
  publishRegistrationEvent,
  publishSignOutEvent,
  publishSuccessfulSignInEvent,
  publishTooManyOtpsRequestedEvent
} from '~/src/messaging/publish.js'

jest.mock('~/src/messaging/publish-base.js')

describe('publish identity events', () => {
  const accountId = 'account-123'
  const email = 'user@example.gov.uk'
  const uid = 'request-456'
  const phone = '+441234567890'
  const publishResult = {
    MessageId: '2888a402-7609-43c5-975f-b1974969cdb6',
    SequenceNumber: undefined,
    $metadata: {}
  }

  beforeEach(() => {
    jest.mocked(publishEvent).mockResolvedValue(publishResult)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  const cases = [
    {
      name: 'successful sign-in',
      type: AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL,
      run: () => publishSuccessfulSignInEvent(accountId, email, uid),
      data: { accountId, email, uid },
      entityId: accountId,
      createdBy: { id: accountId, displayName: email }
    },
    {
      name: 'sign-out',
      type: AuditEventMessageType.IDENTITY_SIGN_OUT,
      run: () => publishSignOutEvent(accountId, email),
      data: { accountId, email },
      entityId: accountId,
      createdBy: { id: accountId, displayName: email }
    },
    {
      name: 'registration',
      type: AuditEventMessageType.IDENTITY_REGISTRATION,
      run: () => publishRegistrationEvent(accountId, email, phone),
      data: { accountId, email, phone },
      entityId: accountId,
      createdBy: { id: accountId, displayName: email }
    },
    {
      name: 'too many OTPs requested',
      type: AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
      run: () => publishTooManyOtpsRequestedEvent(email, uid),
      data: { target: email, uid },
      entityId: expect.any(String),
      createdBy: { id: expect.any(String), displayName: email }
    },
    {
      name: 'incorrect code entered',
      type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
      run: () => publishIncorrectCodeEnteredEvent(uid, accountId),
      data: { uid, accountId },
      entityId: accountId,
      createdBy: { id: accountId, displayName: uid }
    },
    {
      name: 'incorrect code entered without an account',
      type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
      run: () => publishIncorrectCodeEnteredEvent(uid),
      data: { uid },
      entityId: expect.any(String),
      createdBy: { id: expect.any(String), displayName: uid }
    },
    {
      name: 'incorrect code lockout',
      type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_LOCKOUT,
      run: () => publishIncorrectCodeLockoutEvent(uid, accountId),
      data: { uid, accountId },
      entityId: accountId,
      createdBy: { id: accountId, displayName: uid }
    },
    {
      name: 'incorrect code lockout without an account',
      type: AuditEventMessageType.IDENTITY_INCORRECT_CODE_LOCKOUT,
      run: () => publishIncorrectCodeLockoutEvent(uid),
      data: { uid },
      entityId: expect.any(String),
      createdBy: { id: expect.any(String), displayName: uid }
    },
    {
      name: 'account deletion',
      type: AuditEventMessageType.IDENTITY_ACCOUNT_DELETION,
      run: () => publishAccountDeletionEvent(accountId, email),
      data: { accountId, email },
      entityId: accountId,
      createdBy: { id: accountId, displayName: email }
    },
    {
      name: 'email address update',
      type: AuditEventMessageType.IDENTITY_EMAIL_ADDRESS_UPDATED,
      run: () =>
        publishEmailAddressUpdatedEvent(accountId, 'old@example.gov.uk', email),
      data: {
        accountId,
        changed: { old: 'old@example.gov.uk', new: email }
      },
      entityId: accountId,
      createdBy: { id: accountId, displayName: 'old@example.gov.uk' }
    },
    {
      name: 'phone number update',
      type: AuditEventMessageType.IDENTITY_PHONE_NUMBER_UPDATED,
      run: () =>
        publishPhoneNumberUpdatedEvent(
          accountId,
          'test@example.gov.uk',
          '+440000000000',
          phone
        ),
      data: {
        accountId,
        email: 'test@example.gov.uk',
        changed: { old: '+440000000000', new: phone }
      },
      entityId: accountId,
      createdBy: { id: accountId, displayName: '+440000000000' }
    }
  ]

  it.each(cases)(
    'publishes the $name event with its mapped message',
    async ({ run, type, data, entityId, createdBy }) => {
      const result = await run()

      expect(result).toBe(publishResult)
      expect(publishEvent).toHaveBeenCalledTimes(1)
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaVersion: AuditEventMessageSchemaVersion.V1,
          category: AuditEventMessageCategory.AUTHENTICATION,
          source: AuditEventMessageSource.FORMS_IDENTITY,
          type,
          entityId,
          createdAt: expect.any(Date),
          createdBy,
          messageCreatedAt: expect.any(Date),
          data
        })
      )
    }
  )

  it('does not publish an invalid mapped message', async () => {
    await expect(
      // @ts-expect-error - invalid input for testing purposes
      publishSuccessfulSignInEvent(undefined, email, uid)
    ).rejects.toThrow()

    expect(publishEvent).not.toHaveBeenCalled()
  })

  it('propagates publishing errors', async () => {
    const error = new Error('SNS publish failed')
    jest.mocked(publishEvent).mockRejectedValue(error)

    await expect(
      publishSuccessfulSignInEvent(accountId, email, uid)
    ).rejects.toBe(error)
  })
})
