# Test sign-in

Tests and developers can sign in with a test email address. No email is sent. You read the security code from forms-identity-api.

> [!IMPORTANT]
> This is for tests only. It works only for addresses on the test email domain `example.forms.defra.gov.uk`.
>
> Non-test OTPs go through a secure hashing and delivery process and do not use this test approach.

## How it works

1. A sign-in asks for a code for a test address, for example `me@example.forms.defra.gov.uk`.
2. forms-identity-api keeps the code in plain text in the `test-otps` collection. It does not send an email.
3. You read the code from the database, or from the API with the secret `OTP_TEST_READ_SECRET`.
4. You type the code into the sign-in page.

## Get a code with database access

This needs no deployment.

On CDP, use one of these:

- **MongoDB web viewer (preferred).** Open the MongoDB web viewer of forms-identity-api in the CDP Portal. In the `test-otps` collection, find the record for your address. The `code` field holds the code.
- **`mongosh`.** Open CDP Terminal for forms-identity-api, run `mongosh`, then:

  ```js
  db['test-otps'].findOne({ target: 'me@example.forms.defra.gov.uk' })
  ```

## Get a code without database access

This needs a deployment. Set `OTP_TEST_READ_SECRET` on forms-identity-api, then deploy or run the service, so that it has the value. Use a different value in each environment.

Then send the secret as a bearer token to `GET /test/otp/{email}/{purpose}`. For sign-in, the purpose is `SIGNIN_VERIFY_EMAIL`.

forms-smoke-test and forms-perf-test use this method. Their READMEs give the setup.

> [!WARNING]
> forms-identity-api, forms-smoke-test and forms-perf-test share the secret. If you change it, change it for all three services. Otherwise the tests cannot read the code, and sign-in fails.

### CDP

Set the secret on forms-identity-api in the CDP Portal, then deploy the service.

```bash
curl -s \
  -H "Authorization: Bearer <OTP_TEST_READ_SECRET>" \
  "https://forms-identity-api.<environment>.cdp-int.defra.cloud/test/otp/me@example.forms.defra.gov.uk/SIGNIN_VERIFY_EMAIL"
```

### Local

`.env.example` sets the secret to `local-test-read-secret`. Start the service, then:

```bash
curl -s \
  -H "Authorization: Bearer local-test-read-secret" \
  "http://localhost:3010/test/otp/me@example.forms.defra.gov.uk/SIGNIN_VERIFY_EMAIL"
```
