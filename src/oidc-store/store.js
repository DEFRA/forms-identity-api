import { GRANTABLE_COLLECTION_NAMES } from '~/src/mongo.js'

/**
 * Wire-level model names (snake_cased collection names). The routes validate
 * against this allowlist so the API never touches arbitrary collections.
 */
export const MODEL_COLLECTIONS = [
  'session',
  'access_token',
  'authorization_code',
  'grant',
  'interaction',
  'refresh_token',
  'device_code',
  'backchannel_authentication_request',
  'pushed_authorization_request',
  'client_credentials',
  'replay_detection'
]

/**
 * Strips Mongo storage fields before handing a payload back
 * (`expireAt` is our TTL/GC field, not part of the payload)
 * @param {Record<string, unknown>} doc
 */
function strip(doc) {
  const rest = { ...doc }
  delete rest._id
  delete rest.expireAt
  return rest
}

/**
 * Mongo persistence for oidc-provider artifacts, exposed to the UI's HTTP
 * adapter via routes. One collection per model; `_id` is the model's string
 * id; `expiresIn` (seconds) becomes an `expireAt` Date the TTL index
 * garbage-collects (expiry correctness stays in oidc-provider).
 * @param {Db} db
 */
export function makeOidcStore(db) {
  /** @param {string} model */
  function coll(model) {
    return db.collection(model)
  }

  return {
    /**
     * @param {string} model
     * @param {string} id
     * @param {Record<string, unknown>} payload
     * @param {number} [expiresIn]
     */
    async upsert(model, id, payload, expiresIn) {
      /** @type {Record<string, unknown>} */
      const doc = { ...payload }

      if (expiresIn) {
        doc.expireAt = new Date(Date.now() + expiresIn * 1000)
      }

      await coll(model).updateOne(
        { _id: /** @type {never} */ (id) },
        { $set: doc },
        { upsert: true }
      )
    },

    /**
     * @param {string} model
     * @param {string} id
     */
    async find(model, id) {
      const doc = await coll(model).findOne({ _id: /** @type {never} */ (id) })
      return doc ? strip(doc) : undefined
    },

    /**
     * @param {string} model
     * @param {string} uid
     */
    async findByUid(model, uid) {
      const doc = await coll(model).findOne({ uid })
      return doc ? strip(doc) : undefined
    },

    /**
     * @param {string} model
     * @param {string} id
     */
    async consume(model, id) {
      await coll(model).updateOne(
        { _id: /** @type {never} */ (id) },
        { $set: { consumed: Math.floor(Date.now() / 1000) } }
      )
    },

    /**
     * @param {string} model
     * @param {string} id
     */
    async destroy(model, id) {
      await coll(model).deleteOne({ _id: /** @type {never} */ (id) })
    },

    /**
     * @param {string} grantId
     */
    async revokeByGrantId(grantId) {
      await Promise.all(
        GRANTABLE_COLLECTION_NAMES.map((name) =>
          db.collection(name).deleteMany({ grantId })
        )
      )
    }
  }
}

/**
 * @import { Db } from 'mongodb'
 */
