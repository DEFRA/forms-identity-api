import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

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

const modelParam = Joi.string()
  .valid(...MODEL_COLLECTIONS)
  .required()

const modelIdParams = Joi.object({
  model: modelParam,
  id: Joi.string().required()
})

/**
 * Persistence endpoints backing forms-identity-ui's oidc-provider HTTP
 * adapter. These are served on this service's public ingress (service-to-
 * service auth is a later addition); model names are validated against the
 * store's allowlist so they can never read or write arbitrary collections
 * (e.g. accounts).
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
    handler(request) {
      const { model, id } = request.params
      return find(model, id)
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
    handler(request) {
      const { model, uid } = request.params
      return findByUid(model, uid)
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

      // A session's end is a sign-out, but only when it actually held an
      // account (oidc-provider also destroys sessions that never signed in)
      if (model === SESSION_MODEL && payload?.accountId) {
        const account = await accountsRepository.findById(
          /** @type {string} */ (payload.accountId)
        )

        if (account) {
          auditSignOut(account._id, account.email)
        }
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
