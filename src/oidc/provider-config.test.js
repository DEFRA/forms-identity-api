import { config } from '~/src/config/index.js'
import { buildProviderConfig } from '~/src/oidc/provider-config.js'

describe('provider config', () => {
  /** @type {import('oidc-provider').AdapterConstructor} */
  const adapter = /** @type {any} */ (jest.fn())

  /** @type {{ findUserById: jest.Mock }} */
  let userService

  beforeEach(() => {
    userService = { findUserById: jest.fn() }
  })

  /**
   * Builds the provider configuration under test
   */
  function build() {
    return buildProviderConfig(config, adapter, userService)
  }

  it('fails loud when OIDC_JWKS is missing (no boot-generated keys)', () => {
    const original = config.get('oidc.jwks')
    config.set('oidc.jwks', '')

    expect(build).toThrow(/OIDC_JWKS must be set/)

    config.set('oidc.jwks', original)
  })

  it('fails loud when OIDC_COOKIE_KEYS is missing', () => {
    const original = config.get('oidc.cookieKeys')
    config.set('oidc.cookieKeys', '')

    expect(build).toThrow(/OIDC_COOKIE_KEYS must be set/)

    config.set('oidc.cookieKeys', original)
  })

  it('registers the single public runner client with mandatory PKCE', () => {
    const cfg = build()

    expect(cfg.clients).toEqual([
      {
        client_id: 'runner',
        redirect_uris: ['http://localhost:3000/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none'
      }
    ])
    expect(cfg.clientAuthMethods).toEqual([
      'none',
      'private_key_jwt',
      'client_secret_basic'
    ])
    expect(
      /** @type {{ required: () => boolean }} */ (cfg.pkce).required()
    ).toBe(true)
  })

  it('uses the configured signing keys and adapter', () => {
    const cfg = build()

    expect(cfg.adapter).toBe(adapter)
    expect(cfg.jwks?.keys).toHaveLength(1)
    expect(cfg.jwks?.keys[0]).toMatchObject({
      use: 'sig',
      alg: 'RS256',
      kid: 'sig-1'
    })
  })

  it('disables dev interactions and points interactions at /interaction/{uid}', () => {
    const cfg = build()

    expect(cfg.features?.devInteractions?.enabled).toBe(false)

    const url = /** @type {(ctx: any, i: any) => string} */ (
      cfg.interactions?.url
    )
    expect(url({}, { uid: 'u123' })).toBe('/interaction/u123')
  })

  it('sets the token, interaction and session TTLs', () => {
    const cfg = build()

    expect(cfg.ttl).toEqual({
      AuthorizationCode: 60,
      IdToken: 300,
      AccessToken: 300,
      Interaction: 3600,
      Session: 86400,
      Grant: 86400
    })
  })

  it('exposes only sub and email claims', () => {
    const cfg = build()

    expect(cfg.claims).toEqual({
      openid: ['sub'],
      email: ['email', 'email_verified']
    })
  })

  it('signs cookies with the configured comma-separated keys', () => {
    const cfg = build()

    expect(cfg.cookies?.keys).toEqual(['test-key-1', 'test-key-2'])
    expect(cfg.cookies?.long).toEqual({ secure: false, sameSite: 'lax' })
    expect(cfg.cookies?.short).toEqual({ secure: false, sameSite: 'lax' })
  })

  describe('findAccount', () => {
    it('resolves accounts from the users collection with an opaque sub (never a raw email)', async () => {
      userService.findUserById.mockResolvedValue({
        _id: 'user-1',
        email: 'a@b.com'
      })
      const cfg = build()

      const account = await cfg.findAccount?.(/** @type {any} */ ({}), 'user-1')

      expect(userService.findUserById).toHaveBeenCalledWith('user-1')
      expect(account?.accountId).toBe('user-1')
      await expect(
        account?.claims('id_token', 'openid email', {}, [])
      ).resolves.toEqual({
        sub: 'user-1',
        email: 'a@b.com',
        email_verified: true
      })
    })

    it('returns undefined for an unknown account id', async () => {
      userService.findUserById.mockResolvedValue(null)
      const cfg = build()

      await expect(
        cfg.findAccount?.(/** @type {any} */ ({}), 'missing')
      ).resolves.toBeUndefined()
    })
  })
})
