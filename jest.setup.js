import { generateKeyPairSync } from 'node:crypto'

process.env.NODE_ENV = 'test'
process.env.HOST = '0.0.0.0'
process.env.PORT = '4001'
process.env.SERVICE_VERSION = 'test'

process.env.LOG_ENABLED = 'false'
process.env.LOG_LEVEL = 'debug'
process.env.LOG_FORMAT = 'pino-pretty'

process.env.MONGO_URI =
  'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'
process.env.MONGO_DATABASE = 'forms-identity-api'

process.env.HTTP_PROXY = ''

process.env.TRACING_HEADER = 'x-cdp-request-id'

// OIDC provider — a throwaway RSA JWKS per test run (never a real secret)
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = privateKey.export({ format: 'jwk' })

process.env.OIDC_ISSUER = 'http://localhost:3002'
process.env.OIDC_JWKS = JSON.stringify({
  keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: 'sig-1' }]
})
process.env.OIDC_COOKIE_KEYS = 'test-key-1,test-key-2'
process.env.OIDC_RUNNER_REDIRECT_URIS = 'http://localhost:3000/callback'
process.env.OIDC_COOKIE_SECURE = 'false'

// OTP + GOV.UK Notify (dummy values — the Notify client is always mocked)
process.env.OTP_TTL_SECONDS = '900'
process.env.OTP_MAX_ATTEMPTS = '5'
// Deliberately NOT a valid Notify key shape (non-hex 'z' uuids) so GitHub
// push protection never mistakes it for a real credential; the notifier only
// does positional substring extraction, which still works.
process.env.NOTIFY_API_KEY =
  'test_key-zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz-zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'
process.env.NOTIFY_OTP_TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'
