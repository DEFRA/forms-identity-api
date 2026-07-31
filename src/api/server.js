import hapi from '@hapi/hapi'
import Wreck from '@hapi/wreck'
import { ProxyAgent } from 'proxy-agent'

import { config } from '~/src/config/index.js'
import { failAction } from '~/src/helpers/fail-action.js'
import { requestLogger } from '~/src/helpers/logging/request-logger.js'
import { requestTracing } from '~/src/helpers/request-tracing.js'
import { db, prepareDb } from '~/src/mongo.js'
import { makeOidcStore } from '~/src/oidc-store/store.js'
import { router } from '~/src/plugins/router.js'
import { oidcStoreRoutes } from '~/src/routes/oidc-store.js'
import { prepareSecureContext } from '~/src/secure-context.js'

const isProduction = config.get('isProduction')

// Route all Wreck traffic (e.g. GOV.UK Notify) through the CDP egress proxy.
// ProxyAgent reads HTTP_PROXY/HTTPS_PROXY/NO_PROXY and goes direct when unset.
const proxyAgent = new ProxyAgent()

Wreck.agents = {
  https: proxyAgent,
  http: proxyAgent,
  httpsAllowUnauthorized: proxyAgent
}

/**
 * Creates the Hapi server
 */
export async function createServer() {
  const server = hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  await server.register(requestLogger)
  await server.register(requestTracing)

  if (isProduction) {
    prepareSecureContext((message) => {
      server.logger.info(message)
    })
  }

  await prepareDb(server.logger)
  await server.register(router)

  // Registered after prepareDb so the `db` live binding is connected
  server.route(oidcStoreRoutes(makeOidcStore(db)))

  return server
}
