# forms-identity-api

Defra Forms identity API — a private OIDC identity provider for citizen sign-in to Defra forms.

This service issues and manages identities for form submitters. It is a backend API (Hapi + MongoDB) that sits on a private network; browsers never reach it directly — only other Defra Forms services do.

## Sign in flow

This API is a private OIDC provider ([node-oidc-provider](https://github.com/panva/node-oidc-provider)) sitting behind the **forms-identity-ui** public façade:

```
citizen's browser ──▶ forms-identity-ui  :3002  public façade (renders sign-in pages, reverse-proxies OIDC endpoints)
                        ▼
                      forms-identity-api :4001  private OIDC provider (this service)
                        ▼          GOV.UK Notify (email delivery of the one-time code)
                      MongoDB
```

- The advertised/signed OIDC issuer is the **façade's** public URL (`OIDC_ISSUER`), never this API's origin. `provider.proxy = true` trusts the `X-Forwarded-*` headers the façade sets from its configured issuer.
- Sign in is by email one-time code: the façade posts to `POST /otp/request`, a 6-digit code is emailed via GOV.UK Notify (argon2-hashed at rest, single-use, TTL and attempt-capped), and `POST /interaction/{uid}/complete` atomically verifies the code and completes the OIDC interaction.
- The relying party is forms-runner (public client `runner`, authorization code + PKCE). Successful sign-in mints/loads an opaque account id in the `users` collection — the `sub` claim, keeping raw emails out of tokens.

### Sign in local setup

Generate a signing JWKS and add the output to `.env` as `OIDC_JWKS` (copy `.env.example` first):

```sh
node scripts/generate-jwks.mjs
```

Then:

- Set `OIDC_COOKIE_KEYS` (any comma-separated secrets, identical across containers).
- Set `NOTIFY_API_KEY` and `NOTIFY_OTP_TEMPLATE_ID` from GOV.UK Notify. The email template must contain the `((code))` and `((expiry_minutes))` personalisation placeholders.
- Start MongoDB (`docker compose up -d mongo`) then `npm run dev`.

## Requirements

### Node.js

Please install [Node.js](https://nodejs.org/) `>= v22` and [npm](https://nodejs.org/) `>= v10`. You will find it easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm):

```sh
cd forms-identity-api
nvm use
```

## Local development

### Setup

Install application dependencies:

```sh
npm install
```

### MongoDB

The API requires a MongoDB replica set. Start one locally (plus mongo-express on http://localhost:8081) with:

```sh
docker compose up -d mongo
```

### Development

To run the application in `development` mode run:

```sh
npm run dev
```

The API listens on `http://localhost:4001` by default. Check it is running:

```sh
curl http://localhost:4001/health
```

### Testing

To test the application run:

```sh
npm test
```

### Production

To mimic the application running in `production` mode locally run:

```sh
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json). To view them in your command line run:

```sh
npm run
```

## Linting and formatting

```sh
npm run lint
npm run format
```

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government licence v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
