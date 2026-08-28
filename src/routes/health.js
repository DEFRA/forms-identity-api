/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/health',
  options: {
    auth: false
  },
  handler(request, h) {
    return h.response({ message: 'success' }).code(200)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
