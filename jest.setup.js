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
