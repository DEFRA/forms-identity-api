import { PURPOSE, TRANSPORT } from '~/src/constants.js'
import {
  isKeptForTest,
  isTestAddress
} from '~/src/services/test-otp-service.js'

jest.mock('~/src/repositories/test-otps-repository.js')

const TEST_ADDRESS = 'perf-1@example.forms.defra.gov.uk'

describe('test-otp-service', () => {
  describe('isTestAddress', () => {
    it.each([TEST_ADDRESS, 'Perf-1@Example.Forms.Defra.Gov.UK'])(
      'accepts %s',
      (email) => {
        expect(isTestAddress(email)).toBe(true)
      }
    )

    it.each([
      'citizen@defra.gov.uk',
      'citizen@forms.defra.gov.uk',
      'citizen@evil-example.forms.defra.gov.uk',
      'citizen@sub.example.forms.defra.gov.uk',
      'citizen@example.forms.defra.gov.uk.evil.com',
      'example.forms.defra.gov.uk@evil.com',
      'citizen@example.forms.defra.gov.uk@evil.com'
    ])('refuses %s', (email) => {
      expect(isTestAddress(email)).toBe(false)
    })
  })

  describe('isKeptForTest', () => {
    it('keeps a sign-in code for a test address', () => {
      expect(
        isKeptForTest(
          PURPOSE.SIGNIN_VERIFY_EMAIL,
          TRANSPORT.EMAIL,
          TEST_ADDRESS
        )
      ).toBe(true)
    })

    it('sends the code to an address on another domain', () => {
      expect(
        isKeptForTest(
          PURPOSE.SIGNIN_VERIFY_EMAIL,
          TRANSPORT.EMAIL,
          'citizen@defra.gov.uk'
        )
      ).toBe(false)
    })

    it('sends a code that is for a change of email address', () => {
      expect(
        isKeptForTest(
          PURPOSE.ACCOUNT_VERIFY_EMAIL,
          TRANSPORT.EMAIL,
          TEST_ADDRESS
        )
      ).toBe(false)
    })
  })
})
