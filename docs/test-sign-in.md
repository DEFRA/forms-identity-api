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

## Deploy the service

Set the secret `OTP_TEST_READ_SECRET` on forms-identity-api in the CDP Portal, with a different value in each environment. The service does not start without it.

> [!WARNING]
> forms-identity-api, forms-smoke-test and forms-perf-test share the secret. If you change it, change it for all three services. Otherwise the tests get `401` when they read the code, and sign-in fails.

## Set up the smoke and perf tests

Both test suites read the code with the same secret. Their READMEs give the full setup.

| Test suite                                                    | Test addresses                             |
| ------------------------------------------------------------- | ------------------------------------------ |
| [forms-smoke-test](https://github.com/DEFRA/forms-smoke-test) | `smoke-test@example.forms.defra.gov.uk`    |
| [forms-perf-test](https://github.com/DEFRA/forms-perf-test)   | `perf-<thread>@example.forms.defra.gov.uk` |

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

### CDP

There are two ways to read a code on CDP.

1. **MongoDB web viewer (preferred).** Open the MongoDB web viewer of forms-identity-api in the CDP Portal. In the `test-otps` collection, find the record with your address as `target` and the purpose as `purpose`. The `code` field holds the code in plain text. This needs no secret.
2. **`curl`.** Use the command above. You need the value of `OTP_TEST_READ_SECRET` for that environment.

```bash
IDENTITY_API_URL="https://forms-identity-api.${ENVIRONMENT}.cdp-int.defra.cloud"
OTP_TEST_READ_SECRET='<the value for this environment>'
```
