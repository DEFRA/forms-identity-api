import { GRANTABLE_COLLECTION_NAMES, db } from '~/src/mongo.js'

/**
 * Wire-level model names (snake_cased collection names). The routes validate
 * against this allowlist so the API never touches arbitrary collections.
 * Deliberately limited to the models our provider configuration can
 * produce — extend it when enabling a provider feature (refresh tokens,
 * device flow, CIBA, PAR); a missing model fails loudly as a 400 on the
 * feature's first use.
 */
export const MODEL_COLLECTIONS = [
  'session',
  'interaction',
  'grant',
  'authorization_code',
  'access_token'
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

/*
 * Mongo persistence for oidc-provider artifacts, exposed to the UI's HTTP
 * adapter via routes. One collection per model; `_id` is the model's string
 * id; `expiresIn` (seconds) becomes an `expireAt` Date the TTL index
 * garbage-collects (expiry correctness stays in oidc-provider). Collections
 * resolve lazily — the `db` live binding is only assigned once `prepareDb`
 * has run.
 */

/**
 * @param {string} model
 * @param {string} id
 * @param {Record<string, unknown>} payload
 * @param {number} [expiresIn]
 */
export async function upsert(model, id, payload, expiresIn) {
  /** @type {Record<string, unknown>} */
  const doc = { ...payload }

  if (expiresIn) {
    doc.expireAt = new Date(Date.now() + expiresIn * 1000)
  }

  await db
    .collection(model)
    .updateOne(
      { _id: /** @type {never} */ (id) },
      { $set: doc },
      { upsert: true }
    )
}

/**
 * @param {string} model
 * @param {string} id
 */
export async function find(model, id) {
  const doc = await db
    .collection(model)
    .findOne({ _id: /** @type {never} */ (id) })
  return doc ? strip(doc) : undefined
}

/**
 * @param {string} model
 * @param {string} uid
 */
export async function findByUid(model, uid) {
  const doc = await db.collection(model).findOne({ uid })
  return doc ? strip(doc) : undefined
}

/**
 * @param {string} model
 * @param {string} id
 */
export async function consume(model, id) {
  await db
    .collection(model)
    .updateOne(
      { _id: /** @type {never} */ (id) },
      { $set: { consumed: Math.floor(Date.now() / 1000) } }
    )
}

/**
 * @param {string} model
 * @param {string} id
 */
export async function destroy(model, id) {
  await db.collection(model).deleteOne({ _id: /** @type {never} */ (id) })
}

/**
 * @param {string} grantId
 */
export async function revokeByGrantId(grantId) {
  await Promise.all(
    GRANTABLE_COLLECTION_NAMES.map((name) =>
      db.collection(name).deleteMany({ grantId })
    )
  )
}
