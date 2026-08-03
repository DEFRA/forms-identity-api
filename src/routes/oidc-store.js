import Joi from 'joi'

import {
  MODEL_COLLECTIONS,
  consume,
  destroy,
  find,
  findByUid,
  revokeByGrantId,
  upsert
} from '~/src/repositories/oidc-repository.js'

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
    path: '/oidc/{model}/{id}',
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
      return h.response().code(204)
    }
  },
  {
    method: 'GET',
    path: '/oidc/{model}/{id}',
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
      return h.response().code(204)
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
      return h.response().code(204)
    }
  },
  {
    method: 'DELETE',
    path: '/oidc/{model}/{id}',
    options: { validate: { params: modelIdParams } },
    /** @param {ModelIdRequest} request */
    async handler(request, h) {
      const { model, id } = request.params
      await destroy(model, id)
      return h.response().code(204)
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
