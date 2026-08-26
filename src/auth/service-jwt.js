import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'

/**
 * The role ARN the calling service presents as its subject. STS derives this
 * from the credentials that signed the token request, so a caller cannot ask
 * to be someone else.
 *
 * The value is one configured string rather than assembled from an account
 * and a service name, because CDP names task roles per environment
 * (`<environment>-ecs-<service>-role`) and there is no formula that derives
 * the right one everywhere.
 * @returns {string}
 */
export function expectedSubject() {
  return config.get('auth.allowedSubject')
}

/**
 * Requires an AWS STS web identity token on every request, so that reaching
 * the private network is not on its own enough to call this API.
 *
 * Verification is declarative: `@hapi/jwt` checks the signature against the
 * platform key set and compares issuer, audience and subject, so there is no
 * hand-written scheme. The key set is fetched with Wreck, whose agents already
 * route through the CDP proxy.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const serviceJwt = {
  plugin: {
    name: 'service-jwt',
    async register(server) {
      await server.register(Jwt)

      const audience = config.get('auth.jwt.audience')
      const issuer = config.get('auth.jwt.issuer')
      const sub = expectedSubject()

      server.auth.strategy('service-jwt', 'jwt', {
        keys: {
          uri: config.get('auth.jwt.jwksUri'),
          algorithms: ['RS256']
        },
        verify: { aud: audience, iss: issuer, sub },
        validate: false
      })

      server.auth.default('service-jwt')

      // None of these three is secret, and logging them means a mismatch on
      // first deploy shows up as one clear log line rather than a generic
      // 401 that does not say what the API expected.
      server.logger.info(
        `service-jwt expects sub=${sub} iss=${issuer} aud=${audience}`
      )
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
