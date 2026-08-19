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
    default: 3010,
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
  otp: {
    /** @type {SchemaObj<number>} */
    ttlSeconds: {
      doc: 'One-time-code lifetime in seconds (checked in-app; Mongo TTL is GC only)',
      format: Number,
      default: 900,
      env: 'OTP_TTL_SECONDS'
    },
    /** @type {SchemaObj<number>} */
    maxAttempts: {
      doc: 'Failed verification attempts before a code is burned',
      format: Number,
      default: 5,
      env: 'OTP_MAX_ATTEMPTS'
    },
    notify: {
      /** @type {SchemaObj<string>} */
      apiKey: {
        doc: 'GOV.UK Notify API key (required in every environment; never defaulted)',
        format: String,
        default: '',
        sensitive: true,
        env: 'NOTIFY_API_KEY'
      },
      /** @type {SchemaObj<string>} */
      templateId: {
        doc: 'GOV.UK Notify template id for the security-code email (must contain ((code)) and ((expiry_minutes)))',
        format: String,
        default: '',
        env: 'NOTIFY_OTP_TEMPLATE_ID'
      },
      /** @type {SchemaObj<string | null>} */
      replyToId: {
        doc: 'GOV.UK Notify reply-to address id. Sending from a real reply-to address makes the code email likelier to reach an inbox rather than a spam folder, so it is required in every environment and has no default.',
        format: String,
        default: /** @type {string | null} */ (null),
        env: 'NOTIFY_REPLY_TO_ID'
      }
    }
  },
  auth: {
    jwt: {
      /** @type {SchemaObj<string>} */
      issuer: {
        doc: 'Issuer that must have signed the caller token. Set by the platform in deployed environments; the local default is the aws-sts-stub constant.',
        format: String,
        default: 'https://local.tokens.sts.global.api.aws',
        env: 'CDP_JWT_ISSUER'
      },
      /** @type {SchemaObj<string>} */
      jwksUri: {
        doc: 'Public keys that verify the caller token',
        format: String,
        default: 'http://localhost:4571/.well-known/jwks.json',
        env: 'CDP_JWT_JWKS_URI'
      },
      /** @type {SchemaObj<string>} */
      audience: {
        doc: 'Audience the caller must address the token to',
        format: String,
        default: 'forms-identity-api',
        env: 'SERVICE_AUTH_AUDIENCE'
      }
    },
    /** @type {SchemaObj<string | null>} */
    allowedSubject: {
      doc: 'Complete expected `sub` of the caller token — the calling role ARN STS stamps onto it. CDP names task roles per environment, so this has no universal default and is required in production; the local default matches what aws-sts-stub mints.',
      format: String,
      default: isProduction
        ? /** @type {string | null} */ (null)
        : 'arn:aws:iam::000000000000:role/forms-identity-ui',
      env: 'SERVICE_AUTH_ALLOWED_SUBJECT'
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
