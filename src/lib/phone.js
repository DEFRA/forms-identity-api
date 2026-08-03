import libphonenumber from 'google-libphonenumber'

const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance()
const { PhoneNumberFormat, PhoneNumberType } = libphonenumber

/** Types accepted as "mobile" (some regions cannot distinguish fixed/mobile) */
const MOBILE_TYPES = new Set([
  PhoneNumberType.MOBILE,
  PhoneNumberType.FIXED_LINE_OR_MOBILE
])

/**
 * Validates a mobile number (UK default region, international accepted) and
 * normalises it to E.164 — the same google-libphonenumber validation the
 * forms phone component uses
 * @param {string} input
 * @returns {string} the number in E.164 format
 * @throws {Error} when the input is not a valid mobile number
 */
export function normaliseMobile(input) {
  const parsed = phoneUtil.parse(input, 'GB')

  if (!phoneUtil.isValidNumber(parsed)) {
    throw new Error('Not a valid phone number')
  }

  if (!MOBILE_TYPES.has(phoneUtil.getNumberType(parsed))) {
    throw new Error('Not a mobile phone number')
  }

  return phoneUtil.format(parsed, PhoneNumberFormat.E164)
}
