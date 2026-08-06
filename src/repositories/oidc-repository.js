import Boom from '@hapi/boom'

import {
  GRANTABLE_COLLECTION_NAMES,
  OIDC_COLLECTION_NAMES,
  db
} from '~/src/mongo.js'

/**
 * Wire-level model names (snake_cased collection names). The routes validate
 * against this allowlist so the API never touches arbitrary collections.
 * Deliberately limited to the models our provider configuration can
 * produce — extend it when enabling a provider feature (refresh tokens,
 * device flow, CIBA, PAR); a missing model fails loudly as a 400 on the
 * feature's first use.
 */
export const MODEL_COLLECTIONS = OIDC_COLLECTION_NAMES

/*
 * Mongo persistence for oidc-provider artifacts, exposed to forms-identity-ui
 * via routes. One collection per model; `_id` is the model's string id. The
 * provider's opaque payload is stored under a single `payload` field and read
 * back verbatim — nothing else in the stored document is ever returned, so a
 * future storage field can't leak into a response by accident. `expiresIn`
 * (seconds) becomes an `expireAt` Date the TTL index garbage-collects (expiry
 * correctness stays in oidc-provider). Collections resolve lazily — the `db`
 * live binding is only assigned once `prepareDb` has run.
 */

/**
 * @param {string} model
 * @param {string} id
 * @param {Record<string, unknown>} payload
 * @param {number} [expiresIn]
 */
export async function upsert(model, id, payload, expiresIn) {
  // An upsert without expiresIn also clears any expiry a previous write set,
  // so the TTL sweeper can never collect an artifact the provider has since
  // made non-expiring
  const update = expiresIn
    ? { $set: { payload, expireAt: new Date(Date.now() + expiresIn * 1000) } }
    : { $set: { payload }, $unset: { expireAt: '' } }

  await db
    .collection(model)
    .updateOne({ _id: /** @type {never} */ (id) }, update, { upsert: true })
}

/**
 * @param {string} model
 * @param {string} id
 * @throws {Boom.Boom} notFound when the artifact does not exist
 */
export async function find(model, id) {
  const doc = await db
    .collection(model)
    .findOne({ _id: /** @type {never} */ (id) })

  if (!doc) {
    throw Boom.notFound()
  }

  return doc.payload
}

/**
 * @param {string} model
 * @param {string} uid
 * @throws {Boom.Boom} notFound when no artifact has that uid
 */
export async function findByUid(model, uid) {
  const doc = await db.collection(model).findOne({ 'payload.uid': uid })

  if (!doc) {
    throw Boom.notFound()
  }

  return doc.payload
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
      { $set: { 'payload.consumed': Math.floor(Date.now() / 1000) } }
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
      db.collection(name).deleteMany({ 'payload.grantId': grantId })
    )
  )
}
