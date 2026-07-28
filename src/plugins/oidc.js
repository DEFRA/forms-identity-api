import Provider from 'oidc-provider'

import { config } from '~/src/config/index.js'
import { db } from '~/src/mongo.js'
import { makeMongoAdapter } from '~/src/oidc/mongo-adapter.js'
import { buildProviderConfig } from '~/src/oidc/provider-config.js'
import { makeNotifier } from '~/src/otp/notifier.js'
import { makeOtpService } from '~/src/otp/otp-service.js'
import { interactionRoutes } from '~/src/routes/interaction.js'
import * as userService from '~/src/users/user-service.js'

/**
 * Wires up the OIDC provider: Mongo adapter, provider construction from
 * config, interaction routes and the catch-all route that hands every
 * unmatched request to oidc-provider.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const oidc = {
  plugin: {
    name: 'oidc',
    register(server) {
      // Registered AFTER prepareDb so the `db` live binding is connected
      // (see src/api/server.js order). Index creation lives in prepareDb.
      const Adapter = makeMongoAdapter(db)

      const provider = new Provider(
        config.get('oidc.issuer'),
        buildProviderConfig(config, Adapter, userService)
      )
      // The issuer is the public façade origin — trust the X-Forwarded-*
      // headers it sets (derived from configured issuer, never the inbound
      // Host header). This API has no public ingress of its own.
      provider.proxy = true

      server.app.oidcProvider = provider

      const otpService = makeOtpService(db, makeNotifier(), userService)
      server.route(interactionRoutes(provider, otpService))

      const callback = provider.callback()

      // Everything not matched by a more specific route → oidc-provider.
      // hapi matches specific paths (e.g. /health) before this wildcard.
      server.route({
        method: '*',
        path: '/{any*}',
        options: { payload: { output: 'stream', parse: false } },
        handler: (request, h) =>
          new Promise((resolve) => {
            const { req, res } = request.raw
            const done = () => {
              resolve(h.abandon)
            }
            res.on('finish', done)
            res.on('error', done)
            req.on('aborted', done)
            callback(req, res).catch(done)
          })
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
