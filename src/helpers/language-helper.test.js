import { CY, EN_GB, PURPOSE } from '~/src/constants.js'
import { getActionContextForPurpose } from '~/src/helpers/language-helper.js'

describe('getActionContextForPurpose', () => {
  it.each([
    [PURPOSE.SIGNIN_VERIFY_EMAIL, 'sign in'],
    [PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL, 'change your mobile number'],
    [PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE, 'change your email address'],
    [
      PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
      'confirm your new email address'
    ],
    [PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL, 'delete your sign-in']
  ])('gives the English action for %s', (purpose, action) => {
    expect(getActionContextForPurpose(purpose, EN_GB)).toEqual({
      action,
      forText: 'for'
    })
  })

  it.each([
    [PURPOSE.SIGNIN_VERIFY_EMAIL, 'mewngofnodi'],
    [PURPOSE.ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL, 'newid eich rhif ffôn symudol'],
    [PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE, 'newid eich cyfeiriad e-bost'],
    [
      PURPOSE.ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL,
      'cadarnhau eich cyfeiriad e-bost newydd'
    ],
    [
      PURPOSE.ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL,
      'dileu eich manylion mewngofnodi'
    ]
  ])('gives the Welsh action for %s', (purpose, action) => {
    expect(getActionContextForPurpose(purpose, CY)).toEqual({
      action,
      forText: 'ar gyfer'
    })
  })

  it('falls back to English for a language it does not know', () => {
    expect(
      getActionContextForPurpose(PURPOSE.SIGNIN_VERIFY_EMAIL, 'fr')
    ).toEqual({ action: 'sign in', forText: 'for' })
  })
})
