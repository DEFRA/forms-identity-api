import type Provider from 'oidc-provider'

declare module '@hapi/hapi' {
  interface ServerApplicationState {
    oidcProvider: Provider
  }
}
