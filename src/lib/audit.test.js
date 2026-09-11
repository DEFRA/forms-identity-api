// @ts-expect-error - no types available for '@defra/cdp-auditing'
import { audit } from '@defra/cdp-auditing'

import {
  auditRegistration,
  auditSignIn,
  auditSignOut
} from '~/src/lib/audit.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn()
}))

describe('audit events', () => {
  it('records a SignIn event with the account id and email', () => {
    auditSignIn('acc-1', 'citizen@example.com')

    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith({
      event: 'SignIn',
      accountId: 'acc-1',
      email: 'citizen@example.com'
    })
  })

  it('records a SignOut event with the account id and email', () => {
    auditSignOut('acc-1', 'citizen@example.com')

    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith({
      event: 'SignOut',
      accountId: 'acc-1',
      email: 'citizen@example.com'
    })
  })

  it('records a Registration event with the account id, email and phone', () => {
    auditRegistration('acc-1', 'citizen@example.com', '+447911123456')

    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith({
      event: 'Registration',
      accountId: 'acc-1',
      email: 'citizen@example.com',
      phone: '+447911123456'
    })
  })
})
