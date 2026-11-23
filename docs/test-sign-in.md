# Test sign-in

Automated tests and developers sign in with a test email address. forms-identity-api keeps the security code for a test address, and a test reads the code from an API route. No email is sent.

> [!IMPORTANT]
> This is for tests only. It works only for addresses on the test email domain `example.forms.defra.gov.uk`.
>
> Non-test OTPs go through a secure hashing and delivery process and do not use this test approach.

## How it works

1. A sign-in asks for a code for an address such as `smoke-test@example.forms.defra.gov.uk`.
2. The address is on the test domain, so the service keeps the code in plain text in the `test-otps` collection and does not send an email. The record has the same expiry as the code (15 minutes by default).
3. The test reads the code from `GET /test/otp/{email}/{purpose}`, with the value of `OTP_TEST_READ_SECRET` as a bearer token.
4. The test types the code into forms-identity-ui, as a person does.

The test route uses its own auth strategy, `test-otp-secret` ([src/plugins/test-otp.js](../src/plugins/test-otp.js)). It compares the `Authorization` header with `Bearer <OTP_TEST_READ_SECRET>`. The other routes use the CDP service token, because forms-identity-ui is their only caller.

A new request for a code replaces the earlier code for that address and purpose. The route always gives the newest code.

### Purposes

The last part of the path is the purpose of the code:

| Purpose                               | Readable                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `SIGNIN_VERIFY_EMAIL`                 | Yes                                                                         |
| `ACCOUNT_CHANGE_EMAIL_VERIFY_EMAIL`   | Yes, when the new address is a test address                                 |
| `ACCOUNT_CHANGE_PHONE_VERIFY_EMAIL`   | Yes                                                                         |
| `ACCOUNT_DELETE_ACCOUNT_VERIFY_EMAIL` | Yes                                                                         |
| `ACCOUNT_CHANGE_EMAIL_VERIFY_PHONE`   | No. This code goes by SMS, and the service sends every SMS code with Notify |

A test account can use a mobile number in the Ofcom fictional range, 07700 900000 to 07700 900999. Only an account with a test address can use these numbers.

### Responses

| Status | Meaning                                                                   |
| ------ | ------------------------------------------------------------------------- |
| `200`  | `{ "code": "123456" }`                                                    |
| `400`  | The purpose is not one of the values above                                |
| `401`  | The `Authorization` header is missing, or the secret is wrong             |
| `404`  | There is no code for this address and purpose, or the code is out of date |

### Lockout

The service locks an address for 2 hours after 5 requests for a code in 2 hours. This applies to test addresses too. To continue before then, remove the address from the `otp-lockouts` collection (see [CDP Terminal](#cdp-terminal)), or use a different test address.

## Deploy the service

`OTP_TEST_READ_SECRET` is required. The service does not start without it. Set it in every environment, production included, because the smoke tests sign in there.

1. Make a long random value for each environment, for example with `openssl rand -base64 32`. Use a different value in each environment, so that a value from one environment does not work in another.
2. Add the value as the secret `OTP_TEST_READ_SECRET` on forms-identity-api in the CDP Portal.
3. Add the same value to each test suite that signs in in that environment.
4. Deploy forms-identity-api again, so that it reads the new secret.

> [!WARNING]
> The secret is shared by three services: forms-identity-api, forms-smoke-test and forms-perf-test. If you change it in one environment, change it on all three in that environment, then deploy forms-identity-api again. A test suite with a different value gets `401` when it reads the code, and its sign-in fails.

## Set up the smoke and perf tests

Both test suites read the code with the same secret. Their READMEs give the full setup.

| Test suite                                                    | Test addresses                             | Settings on the test suite                 |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| [forms-smoke-test](https://github.com/DEFRA/forms-smoke-test) | `smoke-test@example.forms.defra.gov.uk`    | `OTP_TEST_READ_SECRET`, `IDENTITY_API_URL` |
| [forms-perf-test](https://github.com/DEFRA/forms-perf-test)   | `perf-<thread>@example.forms.defra.gov.uk` | `OTP_TEST_READ_SECRET`, `identityApiBase`  |

Both suites also need `USE_SIGN_IN_FEATURE=true` on forms-runner.

## Read a code yourself

Start a sign-in in forms-runner or forms-identity-ui with a test address, for example `me@example.forms.defra.gov.uk`. Then read the code:

```bash
curl -s \
  -H "Authorization: Bearer $OTP_TEST_READ_SECRET" \
  "$IDENTITY_API_URL/test/otp/me@example.forms.defra.gov.uk/SIGNIN_VERIFY_EMAIL" \
  | jq -r .code
```

### Local

`.env.example` sets `OTP_TEST_READ_SECRET=local-test-read-secret`, and the service listens on port 3010:

```bash
IDENTITY_API_URL=http://localhost:3010
OTP_TEST_READ_SECRET=local-test-read-secret
```

### CDP Terminal

CDP Terminal is available in non-production environments only. Launch it from the Terminal tab of forms-identity-api in the CDP Portal. The session has the permissions of forms-identity-api, so it can read the service database.

Read the code with `curl`:

```bash
IDENTITY_API_URL="https://forms-identity-api.${ENVIRONMENT}.cdp-int.defra.cloud"
OTP_TEST_READ_SECRET='<the value for this environment>'
```

Or read it from the database with `mongosh`. This needs no secret:

```js
db['test-otps'].findOne(
  { target: 'me@example.forms.defra.gov.uk', purpose: 'SIGNIN_VERIFY_EMAIL' },
  { code: 1, expireAt: 1 }
)
```

Remove a lockout:

```js
db['otp-lockouts'].deleteOne({ target: 'me@example.forms.defra.gov.uk' })
```

The service stores addresses in lowercase, so use a lowercase address in a query.

The platform records every CDP Terminal session.
