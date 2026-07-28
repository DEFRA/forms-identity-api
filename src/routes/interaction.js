import Joi from 'joi'

import { config } from '~/src/config/index.js'

/**
 * Handles the oidc-provider interaction entry point. A `consent` prompt is
 * auto-granted (single first-party client, no consent screen); a `login`
 * prompt sends the browser to the façade's render path (public issuer).
 * @param {Provider} provider
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function handleInteractionEntry(provider, request, h) {
  const { req, res } = request.raw
  const details = await provider.interactionDetails(req, res)
  const { prompt, session } = details
  const params = /** @type {{ client_id?: string, scope?: string }} */ (
    details.params
  )

  if (prompt.name === 'consent') {
    const grant = new provider.Grant({
      accountId: session?.accountId,
      clientId: params.client_id
    })
    grant.addOIDCScope(params.scope ?? '')
    const grantId = await grant.save()
    await provider.interactionFinished(
      req,
      res,
      { consent: { grantId } },
      { mergeWithLastSubmission: true }
    )
    return h.abandon
  }

  // login → send the browser to the façade's render path (public issuer)
  res.writeHead(302, {
    Location: `${config.get('oidc.issuer')}/ui/interaction/${details.uid}`
  })
  res.end()
  return h.abandon
}

/**
 * Builds the sign-in interaction routes
 * @param {Provider} provider
 * @param {OtpService} otpService
 * @returns {ServerRoute[]}
 */
export function interactionRoutes(provider, otpService) {
  return [
    {
      method: 'GET',
      path: '/interaction/{uid}',
      handler: (request, h) => handleInteractionEntry(provider, request, h)
    },
    {
      method: 'POST',
      path: '/otp/request',
      options: {
        validate: {
          payload: Joi.object({
            uid: Joi.string().required(),
            email: Joi.string().email().required()
          })
        }
      },
      handler(request) {
        const { uid, email } = /** @type {{ uid: string, email: string }} */ (
          request.payload
        )
        return otpService.requestOtp({ uid, email })
      }
    },
    {
      // Verification and completion are ONE atomic step. Establishing the login
      // session (interactionFinished) happens only after verifyOtp succeeds, in
      // the same request — there is no separate "complete" endpoint that could be
      // reached without a valid code. accountId comes from verifyOtp's stored
      // record, never from the wire, so no client input authenticates anyone.
      method: 'POST',
      path: '/interaction/{uid}/complete',
      options: {
        validate: {
          params: Joi.object({ uid: Joi.string().required() }),
          // code is validated loosely so wrong/expired/empty codes all reach the
          // friendly error redirect below rather than a raw 400 from failAction.
          payload: Joi.object({
            email: Joi.string().email().required(),
            code: Joi.string().allow('').required()
          })
        }
      },
      async handler(request, h) {
        const { req, res } = request.raw
        const uid = /** @type {string} */ (request.params.uid)
        const { email, code } = /** @type {{ email: string, code: string }} */ (
          request.payload
        )

        const result = await otpService.verifyOtp({ uid, email, code })

        if (!result.ok) {
          // No valid OTP → never establish a session. Send the citizen back to
          // the code page (via the public façade) to try again.
          res.writeHead(302, {
            Location:
              `${config.get('oidc.issuer')}/ui/interaction/${uid}/verify` +
              `?email=${encodeURIComponent(email)}&error=1`
          })
          res.end()
          return h.abandon
        }

        await provider.interactionFinished(
          req,
          res,
          { login: { accountId: result.accountId } },
          { mergeWithLastSubmission: false }
        )
        return h.abandon
      }
    }
  ]
}

/**
 * @import Provider from 'oidc-provider'
 * @import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi'
 * @import { OtpService } from '~/src/otp/otp-service.js'
 */
