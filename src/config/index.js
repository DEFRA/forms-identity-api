import { cwd } from 'node:process'

import 'dotenv/config'
import convict from 'convict'

const isProduction = process.env.NODE_ENV === 'production'
const isDev = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

export const config = convict({
  /**@type {SchemaObj<string>} */
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  /**@type {SchemaObj<string>} */
  host: {
    doc: 'The IP address to bind',
    format: String,
    default: '0.0.0.0',
    env: 'HOST'
  },
  /**@type {SchemaObj<number>} */
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 4001,
    env: 'PORT'
  },
  /**@type {SchemaObj<string>} */
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'forms-identity-api'
  },
  /**@type {SchemaObj<string>} */
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    default: '0.0.0',
    env: 'SERVICE_VERSION'
  },
  /**@type {SchemaObj<string>} */
  root: {
    doc: 'Project root',
    format: String,
    default: cwd()
  },
  /**@type {SchemaObj<Boolean>} */
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  /**@type {SchemaObj<Boolean>} */
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDev
  },
  /**@type {SchemaObj<Boolean>} */
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  log: {
    /**@type {SchemaObj<Boolean>} */
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: /** @type {SchemaObj<LevelWithSilent>} */ ({
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    }),
    format: /** @type {SchemaObj<'ecs' | 'pino-pretty'>} */ ({
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    }),
    /**@type {SchemaObj<string[]>} */
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime'],
      env: 'LOG_REDACT'
    }
  },
  mongo: {
    /** @type {SchemaObj<string>} */
    uri: {
      doc: 'URI for mongodb',
      format: String,
      // Default matches the local docker-compose single-node replicaset, which
      // advertises the in-network host `mongo:27017` — directConnection stops
      // the driver chasing that unresolvable name from the host machine.
      default:
        'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true',
      env: 'MONGO_URI'
    },
    /** @type {SchemaObj<string>} */
    databaseName: {
      doc: 'Database name for mongodb',
      format: String,
      default: 'forms-identity-api',
      env: 'MONGO_DATABASE'
    }
  },
  /** @type {SchemaObj<string>} */
  httpProxy: {
    doc: 'HTTP Proxy',
    format: String,
    default: '',
    env: 'HTTP_PROXY'
  },
  /** @type {SchemaObj<boolean>} */
  isSecureContextEnabled: {
    doc: 'Enable Secure Context (adds TRUSTSTORE_* CA certs to outbound TLS)',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  tracing: {
    /** @type {SchemaObj<string>} */
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  }
})

config.validate({ allowed: 'strict' })

/**
 * @import { SchemaObj } from 'convict'
 * @import { LevelWithSilent } from 'pino'
 */
