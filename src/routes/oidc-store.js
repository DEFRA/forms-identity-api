import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { logger } from '~/src/helpers/logging/logger.js'
import { auditSignOut } from '~/src/lib/audit.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import {
  MODEL_COLLECTIONS,
  consume,
  destroy,
  find,
  findByUid,
  revokeByGrantId,
  upsert
} from '~/src/repositories/oidc-repository.js'

/** oidc-provider's model name for a browser session */
const SESSION_MODEL = 'session'

/** One artefact by model and id — the same address for read, write and delete */
const MODEL_ID_PATH = '/oidc/{model}/{id}'

/**
 * How long to wait, after a signed-in session is destroyed, for the provider
 * to store its replacement before treating the destroy as a sign-out
 */
const SESSION_ROTATION_GRACE_MS = 3000

const modelParam = Joi.string()
  .valid(...MODEL_COLLECTIONS)
  .required()

const modelIdParams = Joi.object({
  model: modelParam,
  id: Joi.string().required()
})

/**
 * oidc-provider also destroys a session when it merely rotates the session
 * id (on every login, and on a client-only logout): the old record is
 * deleted and one carrying the same `uid` is stored straight after. That is
 * not a sign-out, so the audit waits briefly and only fires if the account
 * is no longer signed in on that `uid`.
 * @param {string} accountId
 * @param {string} [uid]
 */
function scheduleSignOutAudit(accountId, uid) {
  const timer = setTimeout(() => {
    auditIfSignedOut(accountId, uid).catch((/** @type {unknown} */ err) => {
      logger.error(err, 'Failed to audit sign-out')
    })
  }, SESSION_ROTATION_GRACE_MS)

  timer.unref()
}

/**
 * @param {string} accountId
 * @param {string} [uid]
 */
async function auditIfSignedOut(accountId, uid) {
  const replacement = uid ? await findByUid(SESSION_MODEL, uid) : null

  if (replacement?.accountId === accountId) {
    return
  }

  const account = await accountsRepository.findById(accountId)

  if (account) {
    auditSignOut(account._id, account.email)
  }
}

/**
 * Persistence endpoints backing forms-identity-ui's oidc-provider HTTP
 * adapter. These are served on this service's public ingress (service-to-
 * service auth is a later addition); model names are validated against the
 * store's allowlist so they can never read or write arbitrary collections
 * (e.g. accounts).
 *
 * A read of an artifact that isn't stored answers 204, not 404. The provider
 * probes the store on every token request, so a miss is the routine answer
 * rather than a fault, and a 4xx would have logging, error-rate metrics and
 * alerting all treat the hot path as failing. Reads therefore never 4xx here:
 * an unknown model name is rejected as a 400 by the params validation above.
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'PUT',
    path: MODEL_ID_PATH,
    options: {
      validate: {
        params: modelIdParams,
        payload: Joi.object({
          payload: Joi.object().unknown(true).required(),
          expiresIn: Joi.number().integer().positive().optional()
        })
      }
    },
    /** @param {UpsertRequest} request */
    async handler(request, h) {
      const { model, id } = request.params
      const { payload, expiresIn } = request.payload
      await upsert(model, id, payload, expiresIn)
      return h.response().code(StatusCodes.NO_CONTENT)
    }
  },
  {
    method: 'GET',
    path: MODEL_ID_PATH,
    options: { validate: { params: modelIdParams } },
    /** @param {ModelIdRequest} request */
    async handler(request, h) {
      const { model, id } = request.params
      const payload = await find(model, id)

      if (!payload) {
        return h.response().code(StatusCodes.NO_CONTENT)
      }

      return payload
    }
  },
  {
    method: 'GET',
    path: '/oidc/{model}/uid/{uid}',
    options: {
      validate: {
        params: Joi.object({ model: modelParam, uid: Joi.string().required() })
      }
    },
    /** @param {ModelUidRequest} request */
    async handler(request, h) {
      const { model, uid } = request.params
      const payload = await findByUid(model, uid)

      if (!payload) {
        return h.response().code(StatusCodes.NO_CONTENT)
      }

      return payload
    }
  },
  {
    method: 'POST',
    path: '/oidc/{model}/{id}/consume',
    options: { validate: { params: modelIdParams } },
    /** @param {ModelIdRequest} request */
    async handler(request, h) {
      const { model, id } = request.params
      await consume(model, id)
      return h.response().code(StatusCodes.NO_CONTENT)
    }
  },
  {
    method: 'DELETE',
    path: '/oidc/grants/{grantId}',
    options: {
      validate: { params: Joi.object({ grantId: Joi.string().required() }) }
    },
    /** @param {GrantIdRequest} request */
    async handler(request, h) {
      await revokeByGrantId(request.params.grantId)
      return h.response().code(StatusCodes.NO_CONTENT)
    }
  },
  {
    method: 'DELETE',
    path: MODEL_ID_PATH,
    options: { validate: { params: modelIdParams } },
    /** @param {ModelIdRequest} request */
    async handler(request, h) {
      const { model, id } = request.params
      const payload = await destroy(model, id)

      if (model === SESSION_MODEL && payload?.accountId) {
        scheduleSignOutAudit(
          /** @type {string} */ (payload.accountId),
          /** @type {string | undefined} */ (payload.uid)
        )
      }

      return h.response().code(StatusCodes.NO_CONTENT)
    }
  }
]

/**
 * @import { Request, ServerRoute } from '@hapi/hapi'
 * @typedef {Request<{ Params: { model: string, id: string } }>} ModelIdRequest
 * @typedef {Request<{ Params: { model: string, uid: string } }>} ModelUidRequest
 * @typedef {Request<{ Params: { grantId: string } }>} GrantIdRequest
 * @typedef {Request<{ Params: { model: string, id: string }, Payload: { payload: Record<string, unknown>, expiresIn?: number } }>} UpsertRequest
 */
