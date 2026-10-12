import { normaliseMobile } from '~/src/lib/phone.js'

describe('normaliseMobile', () => {
  it.each([
    ['07911 123456', '+447911123456'], // UK national format
    ['+44 7911 123456', '+447911123456'],
    ['+33 6 12 34 56 78', '+33612345678'], // international mobile
    ['+1 202 456 1111', '+12024561111'] // US: FIXED_LINE_OR_MOBILE regions count as mobile
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseMobile(input)).toBe(expected)
  })

  it.each([
    ['020 7946 0000'], // UK landline — not a mobile
    ['07700 900123'], // Ofcom drama range — libphonenumber treats as unassignable
    ['07700'], // too short
    ['not a number'],
    ['']
  ])('throws on %s', (input) => {
    expect(() => normaliseMobile(input)).toThrow()
  })

  describe('with test numbers allowed', () => {
    it.each([
      ['07700900000', '+447700900000'], // first number of the Ofcom range
      ['07700 900999', '+447700900999'], // last number of the Ofcom range
      ['+44 7700 900123', '+447700900123'],
      ['07911 123456', '+447911123456'] // a real mobile is still accepted
    ])('normalises %s to %s', (input, expected) => {
      expect(normaliseMobile(input, { allowTestNumbers: true })).toBe(expected)
    })

    it.each([
      ['07700 901000'], // one above the Ofcom range
      ['+33 7700 900000'], // the range is a UK range
      ['020 7946 0000'],
      ['not a number']
    ])('throws on %s', (input) => {
      expect(() => normaliseMobile(input, { allowTestNumbers: true })).toThrow()
    })
  })
})
