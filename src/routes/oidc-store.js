import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  MODEL_COLLECTIONS,
  consume,
  destroy,
  find,
  findByUid,
  revokeByGrantId,
  upsert
} from '~/src/oidc-store/store.js'

const modelParam = Joi.string()
  .valid(...MODEL_COLLECTIONS)
  .required()

/**
 * Internal persistence endpoints backing the UI's oidc-provider HTTP
 * adapter. Model names are validated against the store's allowlist so this
 * can never read or write arbitrary collections (e.g. accounts).
 */
export default /** @type {ServerRoute[]} */ ([
  {
    method: 'PUT',
    path: '/oidc/{model}/{id}',
    options: {
      validate: {
        params: Joi.object({
          model: modelParam,
          id: Joi.string().required()
        }),
        payload: Joi.object({
          payload: Joi.object().unknown(true).required(),
          expiresIn: Joi.number().integer().positive().optional()
        })
      }
    },
    async handler(request, h) {
      const { model, id } = /** @type {{ model: string, id: string }} */ (
        request.params
      )
      const body =
        /** @type {{ payload: Record<string, unknown>, expiresIn?: number }} */ (
          request.payload
        )
      await upsert(model, id, body.payload, body.expiresIn)
      return h.response().code(204)
    }
  },
  {
    method: 'GET',
    path: '/oidc/{model}/{id}',
    options: {
      validate: {
        params: Joi.object({
          model: modelParam,
          id: Joi.string().required()
        })
      }
    },
    async handler(request) {
      const { model, id } = /** @type {{ model: string, id: string }} */ (
        request.params
      )
      const payload = await find(model, id)
      return payload ?? Boom.notFound()
    }
  },
  {
    method: 'GET',
    path: '/oidc/{model}/uid/{uid}',
    options: {
      validate: {
        params: Joi.object({
          model: modelParam,
          uid: Joi.string().required()
        })
      }
    },
    async handler(request) {
      const { model, uid } = /** @type {{ model: string, uid: string }} */ (
        request.params
      )
      const payload = await findByUid(model, uid)
      return payload ?? Boom.notFound()
    }
  },
  {
    method: 'POST',
    path: '/oidc/{model}/{id}/consume',
    options: {
      validate: {
        params: Joi.object({
          model: modelParam,
          id: Joi.string().required()
        })
      }
    },
    async handler(request, h) {
      const { model, id } = /** @type {{ model: string, id: string }} */ (
        request.params
      )
      await consume(model, id)
      return h.response().code(204)
    }
  },
  {
    method: 'DELETE',
    path: '/oidc/grants/{grantId}',
    options: {
      validate: {
        params: Joi.object({ grantId: Joi.string().required() })
      }
    },
    async handler(request, h) {
      const grantId = /** @type {string} */ (request.params.grantId)
      await revokeByGrantId(grantId)
      return h.response().code(204)
    }
  },
  {
    method: 'DELETE',
    path: '/oidc/{model}/{id}',
    options: {
      validate: {
        params: Joi.object({
          model: modelParam,
          id: Joi.string().required()
        })
      }
    },
    async handler(request, h) {
      const { model, id } = /** @type {{ model: string, id: string }} */ (
        request.params
      )
      await destroy(model, id)
      return h.response().code(204)
    }
  }
])

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
