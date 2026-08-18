import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'

/**
 * The role ARN the calling service presents as its subject. STS derives this
 * from the credentials that signed the token request, so a caller cannot ask
 * to be someone else.
 * @returns {string}
 */
export function expectedSubject() {
  const account = config.get('auth.awsAccount')
  const caller = config.get('auth.allowedCaller')

  return `arn:aws:iam::${account}:role/${caller}`
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

      server.auth.strategy('service-jwt', 'jwt', {
        keys: {
          uri: config.get('auth.jwt.jwksUri'),
          algorithms: ['RS256']
        },
        verify: {
          aud: config.get('auth.jwt.audience'),
          iss: config.get('auth.jwt.issuer'),
          sub: expectedSubject()
        },
        validate: false
      })

      server.auth.default('service-jwt')
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
