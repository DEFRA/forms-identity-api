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
  },
  oidc: {
    /** @type {SchemaObj<string>} */
    issuer: {
      doc: 'Public OIDC issuer URL — the forms-identity-ui façade origin. This is what gets signed into tokens, never this private API origin',
      format: String,
      default: 'http://localhost:3002',
      env: 'OIDC_ISSUER'
    },
    /** @type {SchemaObj<string>} */
    jwks: {
      doc: 'JSON JWKS (private signing keys). Required — generate locally with `node scripts/generate-jwks.mjs`',
      format: String,
      default: '',
      env: 'OIDC_JWKS',
      sensitive: true
    },
    /** @type {SchemaObj<string>} */
    cookieKeys: {
      doc: 'Comma-separated cookie signing keys, identical across containers',
      format: String,
      default: '',
      env: 'OIDC_COOKIE_KEYS',
      sensitive: true
    },
    /** @type {SchemaObj<string>} */
    runnerRedirectUris: {
      doc: "Comma-separated redirect URIs registered for the 'runner' client (forms-runner callback)",
      format: String,
      default: 'http://localhost:3000/callback',
      env: 'OIDC_RUNNER_REDIRECT_URIS'
    },
    /** @type {SchemaObj<boolean>} */
    cookieSecure: {
      doc: 'Whether OIDC cookies are marked Secure',
      format: Boolean,
      default: isProduction,
      env: 'OIDC_COOKIE_SECURE'
    }
  },
  otp: {
    /** @type {SchemaObj<number>} */
    ttlSeconds: {
      doc: 'One-time code time-to-live in seconds',
      format: 'nat',
      default: 900,
      env: 'OTP_TTL_SECONDS'
    },
    /** @type {SchemaObj<number>} */
    maxAttempts: {
      doc: 'Failed verification attempts before a one-time code is burned',
      format: 'nat',
      default: 5,
      env: 'OTP_MAX_ATTEMPTS'
    },
    notify: {
      /** @type {SchemaObj<string>} */
      apiKey: {
        doc: 'GOV.UK Notify API key for one-time code emails',
        format: String,
        default: '',
        env: 'NOTIFY_API_KEY',
        sensitive: true
      },
      /** @type {SchemaObj<string>} */
      templateId: {
        doc: 'GOV.UK Notify email template id. The template must contain ((code)) and ((expiry_minutes)) placeholders',
        format: String,
        default: '',
        env: 'NOTIFY_OTP_TEMPLATE_ID'
      }
    }
  }
})

config.validate({ allowed: 'strict' })

/**
 * @import { SchemaObj } from 'convict'
 * @import { LevelWithSilent } from 'pino'
 */
