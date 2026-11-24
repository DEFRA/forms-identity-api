import { PURPOSE } from '~/src/constants.js'

/**
 * Get the action string for a given purpose and language
 * @param {PurposeType} purpose
 * @param {string} language
 * @returns {{ action: string, forText: string }}
 */
export function getActionContextForPurpose(purpose, language) {
  const isWelsh = language === 'cy'
  const actionLookup = /** @type {{ [key in PurposeType]: string }} */ ({
    [PURPOSE.SIGNIN_VERIFY_EMAIL]: isWelsh ? 'mewngofnodi' : 'sign in',
    [PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL]: isWelsh
      ? 'newid eich rhif ffôn symudol'
      : 'change your mobile number',
    [PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE]: isWelsh
      ? 'newid eich cyfeiriad e-bost'
      : 'change your email address',
    [PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL]: isWelsh
      ? 'cadarnhau eich cyfeiriad e-bost newydd'
      : 'confirm your new email address',
    [PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL]: isWelsh
      ? 'dileu eich manylion mewngofnodi'
      : 'delete your sign-in'
  })
  return {
    action: actionLookup[purpose],
    forText: isWelsh ? 'ar gyfer' : 'for'
  }
}

/**
 * @import { PurposeType } from '~/src/constants.js'
 */
