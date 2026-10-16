import { isTestAddress } from '~/src/services/test-otp-service.js'

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
      'example.forms.defra.gov.uk',
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
})
