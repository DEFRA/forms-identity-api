import { config } from '~/src/config/index.js'

describe('config', () => {
  it('should use the test environment variables', () => {
    expect(config.get('env')).toBe('test')
    expect(config.get('host')).toBe('0.0.0.0')
    expect(config.get('port')).toBe(3010)
    expect(config.get('isTest')).toBe(true)
    expect(config.get('isProduction')).toBe(false)
  })

  it('should configure the service metadata', () => {
    expect(config.get('serviceName')).toBe('forms-identity-api')
    expect(config.get('serviceVersion')).toBe('test')
  })

  it('should configure logging', () => {
    expect(config.get('log.enabled')).toBe(false)
    expect(config.get('log.level')).toBe('debug')
    expect(config.get('log.format')).toBe('pino-pretty')
  })

  it('should configure mongodb', () => {
    expect(config.get('mongo.uri')).toBe(
      'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'
    )
    expect(config.get('mongo.databaseName')).toBe('forms-identity-api')
  })

  it('should configure request tracing', () => {
    expect(config.get('tracing.header')).toBe('x-cdp-request-id')
  })

  it('should configure one-time codes', () => {
    expect(config.get('otp.ttlSeconds')).toBe(900)
    expect(config.get('otp.maxAttempts')).toBe(5)
  })

  it('should read Notify credentials from the environment', () => {
    expect(config.get('otp.notify.apiKey')).toBe(process.env.NOTIFY_API_KEY)
    expect(config.get('otp.notify.templateId')).toBe(
      process.env.NOTIFY_OTP_TEMPLATE_ID
    )
  })
})
