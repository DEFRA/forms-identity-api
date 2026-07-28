/**
 * Grantable oidc-provider models: revoking a grant must destroy every
 * artifact issued under it, across all of these collections.
 */
const GRANTABLE = new Set([
  'access_token',
  'authorization_code',
  'refresh_token',
  'device_code',
  'backchannel_authentication_request'
])

/**
 * An adapter payload as stored in Mongo: `_id` is the model's string id and
 * `expireAt` our TTL/GC field
 * @typedef {AdapterPayload & { _id: string, expireAt?: Date }} AdapterDocument
 */

/**
 * Build an oidc-provider Adapter class bound to an existing Mongo `db`.
 * One collection per model name (snake_cased). Uses the string id as `_id`.
 * oidc-provider instantiates it as `new Adapter(modelName)`.
 * @param {Db} db - the connected Mongo database
 * @returns {AdapterConstructor}
 */
export function makeMongoAdapter(db) {
  /**
   * Strips Mongo storage fields before handing a payload back to
   * oidc-provider (`expireAt` is our TTL/GC field, not part of the payload)
   * @param {AdapterDocument} doc
   * @returns {AdapterPayload}
   */
  function strip(doc) {
    /** @type {Document} */
    const rest = { ...doc }
    delete rest._id
    delete rest.expireAt
    return rest
  }

  /**
   * Mongo-backed oidc-provider adapter
   * @implements {Adapter}
   */
  class MongoAdapter {
    /**
     * @param {string} name - the oidc-provider model name (e.g. 'AuthorizationCode')
     */
    constructor(name) {
      this.name = snakeCase(name)
      this.coll = /** @type {Collection<AdapterDocument>} */ (
        db.collection(this.name)
      )
    }

    /**
     * Upserts a payload; `expiresIn` (seconds) becomes an `expireAt` date the
     * Mongo TTL index garbage-collects (expiry correctness stays in-app)
     * @param {string} id
     * @param {AdapterPayload} payload
     * @param {number} [expiresIn]
     */
    async upsert(id, payload, expiresIn) {
      /** @type {Partial<AdapterDocument>} */
      const doc = { ...payload }

      if (expiresIn) {
        doc.expireAt = new Date(Date.now() + expiresIn * 1000)
      }

      await this.coll.updateOne({ _id: id }, { $set: doc }, { upsert: true })
    }

    /**
     * Finds a payload by model id
     * @param {string} id
     */
    async find(id) {
      const doc = await this.coll.findOne({ _id: id })
      return doc ? strip(doc) : undefined
    }

    /**
     * Finds a session payload by its uid
     * @param {string} uid
     */
    async findByUid(uid) {
      const doc = await this.coll.findOne({ uid })
      return doc ? strip(doc) : undefined
    }

    /**
     * Finds a device code payload by its user code
     * @param {string} userCode
     */
    async findByUserCode(userCode) {
      const doc = await this.coll.findOne({ userCode })
      return doc ? strip(doc) : undefined
    }

    /**
     * Marks a payload consumed (single-use artifacts)
     * @param {string} id
     */
    async consume(id) {
      await this.coll.updateOne(
        { _id: id },
        { $set: { consumed: Math.floor(Date.now() / 1000) } }
      )
    }

    /**
     * Deletes a payload by model id
     * @param {string} id
     */
    async destroy(id) {
      await this.coll.deleteOne({ _id: id })
    }

    /**
     * Deletes every grantable artifact issued under a grant
     * @param {string} grantId
     */
    async revokeByGrantId(grantId) {
      await Promise.all(
        [...GRANTABLE].map((name) =>
          db.collection(name).deleteMany({ grantId })
        )
      )
    }
  }

  return MongoAdapter
}

/**
 * Converts an oidc-provider model name to its collection name
 * (e.g. 'AuthorizationCode' -> 'authorization_code')
 * @param {string} name
 */
function snakeCase(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * @import { Adapter, AdapterConstructor, AdapterPayload } from 'oidc-provider'
 * @import { Collection, Db, Document } from 'mongodb'
 */
