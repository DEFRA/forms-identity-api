/**
 * Build the oidc-provider configuration object from convict config.
 * `adapter` is passed in by the plugin (it needs the live db) and
 * `userService` backs `findAccount` (opaque account ids, never raw emails);
 * everything else is derived from config so it is identical across containers.
 *
 * OIDC_JWKS is REQUIRED (no boot-generate fallback): boot-generated keys
 * break horizontal scaling and silently mask a missing secret in a deployed
 * env. Local dev and tests supply it via .env / the jest setup file.
 * @param {typeof appConfig} config - the convict config
 * @param {AdapterConstructor} adapter
 * @param {{ findUserById: (id: string) => Promise<UserDocument | null> }} userService
 * @returns {Configuration}
 */
export function buildProviderConfig(config, adapter, userService) {
  const jwksRaw = config.get('oidc.jwks')

  if (!jwksRaw) {
    throw new Error(
      'OIDC_JWKS must be set (run `node scripts/generate-jwks.mjs` and put it in .env)'
    )
  }

  const jwks = /** @type {{ keys: JWK[] }} */ (JSON.parse(jwksRaw))
  const keys = jwks.keys

  const cookieKeysRaw = config.get('oidc.cookieKeys')

  if (!cookieKeysRaw) {
    throw new Error(
      'OIDC_COOKIE_KEYS must be set (comma-separated, identical across containers)'
    )
  }

  const cookieSecure = config.get('oidc.cookieSecure')

  return {
    adapter,
    clients: [
      {
        client_id: 'runner',
        redirect_uris: config.get('oidc.runnerRedirectUris').split(','),
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none'
      }
    ],
    jwks: { keys },
    clientAuthMethods: ['none', 'private_key_jwt', 'client_secret_basic'],
    pkce: { required: () => true },
    features: { devInteractions: { enabled: false } },
    interactions: {
      url(_ctx, interaction) {
        return `/interaction/${interaction.uid}`
      }
    },
    ttl: {
      AuthorizationCode: 60,
      IdToken: 300,
      AccessToken: 300,
      Interaction: 3600,
      Session: 86400,
      Grant: 86400
    },
    claims: { openid: ['sub'], email: ['email', 'email_verified'] },
    async findAccount(_ctx, id) {
      const user = await userService.findUserById(id)

      if (!user) {
        return undefined
      }

      return {
        accountId: user._id,
        claims() {
          return Promise.resolve({
            sub: user._id,
            email: user.email,
            email_verified: true
          })
        }
      }
    },
    cookies: {
      keys: cookieKeysRaw.split(','),
      long: { secure: cookieSecure, sameSite: 'lax' },
      short: { secure: cookieSecure, sameSite: 'lax' }
    }
  }
}

/**
 * @import { config as appConfig } from '~/src/config/index.js'
 * @import { AdapterConstructor, Configuration, JWK } from 'oidc-provider'
 * @import { UserDocument } from '~/src/users/user-service.js'
 */
