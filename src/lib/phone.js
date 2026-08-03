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
 * @returns {string | null} E.164 string, or null when not a valid mobile
 */
export function normaliseMobile(input) {
  let parsed

  try {
    parsed = phoneUtil.parse(input, 'GB')
  } catch {
    return null
  }

  if (!phoneUtil.isValidNumber(parsed)) {
    return null
  }

  if (!MOBILE_TYPES.has(phoneUtil.getNumberType(parsed))) {
    return null
  }

  return phoneUtil.format(parsed, PhoneNumberFormat.E164)
}
