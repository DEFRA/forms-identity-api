import libphonenumber from 'google-libphonenumber'

const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance()
const { PhoneNumberFormat, PhoneNumberType } = libphonenumber

/** Types accepted as "mobile" (some regions cannot distinguish fixed/mobile) */
const MOBILE_TYPES = new Set([
  PhoneNumberType.MOBILE,
  PhoneNumberType.FIXED_LINE_OR_MOBILE
])

const UK_COUNTRY_CODE = 44

/**
 * The mobile numbers Ofcom reserves for fiction: 07700 900000 to
 * 07700 900999. No person owns one, so a test account can use them.
 */
const TEST_NATIONAL_NUMBER = /^7700900\d{3}$/

/**
 * Whether a parsed number is in the Ofcom fictional mobile range
 * @param {PhoneNumber} parsed
 */
export function isTestNumber(parsed) {
  return (
    parsed.getCountryCode() === UK_COUNTRY_CODE &&
    TEST_NATIONAL_NUMBER.test(String(parsed.getNationalNumber()))
  )
}

/**
 * Validates a mobile number (UK default region, international accepted) and
 * normalises it to E.164
 * @param {string} input
 * @param {boolean} [allowTestNumbers] - accepts the Ofcom fictional mobile
 * range, which is for test accounts only
 * @returns {string} the number in E.164 format
 * @throws {Error} when the input is not a valid mobile number
 */
export function normaliseMobile(input, allowTestNumbers = false) {
  const parsed = phoneUtil.parse(input, 'GB')

  // The library reports a fictional number as not valid, so the checks
  // below apply to all other numbers
  if (!(allowTestNumbers && isTestNumber(parsed))) {
    if (!phoneUtil.isValidNumber(parsed)) {
      throw new Error('Not a valid phone number')
    }

    if (!MOBILE_TYPES.has(phoneUtil.getNumberType(parsed))) {
      throw new Error('Not a mobile phone number')
    }
  }

  return phoneUtil.format(parsed, PhoneNumberFormat.E164)
}

/**
 * @import { PhoneNumber } from 'google-libphonenumber'
 */
