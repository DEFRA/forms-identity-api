# Test sign-in

Tests and developers can sign in with a test email address. No email is sent. You read the security code from forms-identity-api.

> [!IMPORTANT]
> This is for tests only. It works only for addresses on the test email domain `example.forms.defra.gov.uk`.
>
> Non-test OTPs go through a secure hashing and delivery process and do not use this test approach.

## How it works

1. A sign-in asks for a code for a test address.
2. forms-identity-api keeps the code in the `test-otps` collection. It does not send an email.
3. You read the code from `GET /test/otp/{email}/{purpose}`. Send the value of `OTP_TEST_READ_SECRET` as a bearer token.
4. You type the code into the sign-in page.

For sign-in, the purpose is `SIGNIN_VERIFY_EMAIL`.

## Deploy

Set the secret `OTP_TEST_READ_SECRET` on forms-identity-api in the CDP Portal. Use a different value in each environment. The service does not start without it.

forms-smoke-test and forms-perf-test use the same secret to sign in. Their READMEs give the setup.

> [!WARNING]
> forms-identity-api, forms-smoke-test and forms-perf-test share the secret. If you change it, change it for all three services. Otherwise the tests cannot read the code, and sign-in fails.

## Use

Start a sign-in with a test address, for example `me@example.forms.defra.gov.uk`. Then read the code.

### Local

```bash
curl -s \
  -H "Authorization: Bearer local-test-read-secret" \
  "http://localhost:3010/test/otp/me@example.forms.defra.gov.uk/SIGNIN_VERIFY_EMAIL"
```

### CDP

1. **MongoDB web viewer (preferred).** Open the MongoDB web viewer of forms-identity-api in the CDP Portal. In the `test-otps` collection, find the record for your address. The `code` field holds the code.
2. **`curl`.** You need the value of `OTP_TEST_READ_SECRET` for that environment.

```bash
curl -s \
  -H "Authorization: Bearer <OTP_TEST_READ_SECRET>" \
  "https://forms-identity-api.<environment>.cdp-int.defra.cloud/test/otp/me@example.forms.defra.gov.uk/SIGNIN_VERIFY_EMAIL"
```
