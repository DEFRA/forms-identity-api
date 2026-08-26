import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'

/**
 * Use AWS Web Identity to verify that only a single service
 * (forms-identity-ui) can call this service. We verify the tokens that AWS
 * issued and assert the subject is as we expect.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const serviceJwt = {
  plugin: {
    name: 'service-jwt',
    async register(server) {
      await server.register(Jwt)

      const audience = config.get('auth.jwt.audience')
      const issuer = config.get('auth.jwt.issuer')
      const jwksUri = config.get('auth.jwt.jwksUri')
      const sub = config.get('auth.allowedSubject')

      server.auth.strategy('service-jwt', 'jwt', {
        keys: {
          uri: jwksUri,
          algorithms: ['RS256']
        },
        verify: { aud: audience, iss: issuer, sub },
        validate: false
      })

      server.auth.default('service-jwt')
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
