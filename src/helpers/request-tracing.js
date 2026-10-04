import {
  USER_ID_HEADER,
  requestTracing as requestTracingPlugin
} from '@defra/forms-common'
import { tracing } from '@defra/hapi-tracing'

import { config } from '~/src/config/index.js'

const tracingHeader = config.get('tracing.header')

/**
 * Gets the account ID of the user the calling service is acting for, which
 * forms-identity-ui sends in the user ID header. The header is only trusted
 * once the caller's service token has been verified.
 * @param {Request} request
 * @returns {string | undefined}
 */
export function getRequestUserId(request) {
  if (!request.auth.isAuthenticated) {
    return undefined
  }

  return /** @type {string | undefined} */ (request.headers[USER_ID_HEADER])
}

/**
 * Starts a log context for every request, holding the correlation ID from the
 * tracing header (or a new ID when the caller sent none) and the account ID
 * of the user. The logger writes both on every log line.
 * @satisfies {ServerRegisterPluginObject<RequestTracingOptions>}
 */
export const requestTracing = {
  plugin: requestTracingPlugin,
  options: {
    tracingHeader,
    tracingPlugin: tracing.plugin,
    getUserId: getRequestUserId
  }
}

/**
 * @import { RequestTracingOptions } from '@defra/forms-common'
 * @import { Request, ServerRegisterPluginObject } from '@hapi/hapi'
 */
