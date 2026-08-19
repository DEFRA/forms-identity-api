# forms-identity-api

Defra Forms identity API — a private OIDC identity provider for citizen sign-in to Defra forms.

This service issues and manages identities for form submitters. It is a backend API (Hapi + MongoDB) that sits on a private network; browsers never reach it directly — only other Defra Forms services do.

## Deployment order

forms-identity-ui must deploy before this service. Every request here needs
a caller token, and forms-identity-ui is the only service that mints one —
deploying this API first means it starts rejecting every call before
anything sends a token, breaking sign-in until forms-identity-ui catches up.

## Requirements

### Node.js

Please install [Node.js](https://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `>= v12`. You will find it easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm):

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

### aws-sts-stub

Every request needs a signed caller token, verified against a JWKS endpoint.
`@hapi/jwt` fetches that key set as soon as the server initialises, so it
needs a running stub before `npm run dev` — otherwise the process fails to
start with `ECONNREFUSED`. Start it from
[`forms-development-tools`](https://github.com/DEFRA/forms-development-tools):

```sh
cd ../forms-development-tools/local-development-dependencies
docker compose up -d aws-sts-stub
```

### Development

To run the application in `development` mode run:

```sh
npm run dev
```

The API listens on `http://localhost:3010` by default. Check it is running:

```sh
curl http://localhost:3010/health
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
