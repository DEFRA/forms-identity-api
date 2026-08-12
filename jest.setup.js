process.env.NODE_ENV = 'test'
process.env.HOST = '0.0.0.0'
process.env.PORT = '3010'
process.env.SERVICE_VERSION = 'test'

process.env.LOG_ENABLED = 'false'
process.env.LOG_LEVEL = 'debug'
process.env.LOG_FORMAT = 'pino-pretty'

process.env.MONGO_URI =
  'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'
process.env.MONGO_DATABASE = 'forms-identity-api'

process.env.HTTP_PROXY = ''

// Notify test values — the non-hex 'z' uuids keep GitHub push protection
// (which pattern-matches real Notify keys) from firing on this file. The two
// uuids differ so tests can tell the service id (first) from the key id (last)
process.env.NOTIFY_API_KEY =
  'test_key-zzzzzzzz-zzzz-zzzz-zzzz-servicezzzzz-zzzzzzzz-zzzz-zzzz-zzzz-apikeyzzzzzz'
process.env.NOTIFY_OTP_TEMPLATE_ID = 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'
process.env.NOTIFY_REPLY_TO_ID = 'zzzzzzzz-zzzz-zzzz-zzzz-replytozzzzz'

process.env.TRACING_HEADER = 'x-cdp-request-id'
