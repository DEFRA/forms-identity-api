import { getErrorMessage } from '~/src/helpers/error-message.js'

describe('getErrorMessage', () => {
  it('should return the message for Error instances', () => {
    expect(getErrorMessage(new Error('Something went wrong'))).toBe(
      'Something went wrong'
    )
  })

  it('should stringify non-error values', () => {
    expect(getErrorMessage('failure')).toBe('failure')
    expect(getErrorMessage(404)).toBe('404')
  })
})
