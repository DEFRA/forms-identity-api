import { joi, telephoneSchema } from '~/src/lib/telephone.js'

const schema = /** @type {TelephoneSchema} */ (joi.string())
  .phoneNumber()
  .required()

describe('telephone joi extension', () => {
  it.each([
    ['07911 123456'], // UK-plan mobile, national format
    ['+44 7911 123456'],
    ['020 7946 0000'], // UK landline — a real number, so the rule accepts it
    ['+33 6 12 34 56 78'] // international mobile
  ])('accepts %s', (value) => {
    expect(schema.validate(value).error).toBeUndefined()
  })

  it.each([['not a number'], ['07700'], ['']])('rejects %s', (value) => {
    expect(schema.validate(value).error).toBeDefined()
  })
})

describe('telephone schema', () => {
  it.each([
    ['07911 123456'],
    ['020 7946 0000'], // a landline has the shape of a telephone number
    ['07700900000'], // first number of the Ofcom fictional range
    ['+44 7700 900999'] // last number of the Ofcom fictional range
  ])('accepts %s', (value) => {
    expect(telephoneSchema.required().validate(value).error).toBeUndefined()
  })

  it.each([['not a number'], ['07700'], ['07700 901000'], ['']])(
    'rejects %s with the telephone message',
    (value) => {
      const { error } = telephoneSchema
        .required()
        .label('phone')
        .validate(value)

      expect(error?.message).toBe('"phone" must be a telephone number')
    }
  )
})

/**
 * @import { TelephoneSchema } from '~/src/lib/telephone.js'
 */
