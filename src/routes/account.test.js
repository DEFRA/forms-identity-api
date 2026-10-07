import Hapi from '@hapi/hapi'

import accountRoutes from '~/src/routes/account.js'
import { updateEmail } from '~/src/services/account-service.js'

jest.mock('~/src/services/account-service.js')

/** Builds a server with the static routes (services are module-mocked) */
async function buildServer() {
  const server = Hapi.server()
  server.route([...accountRoutes])
  await server.initialize()
  return server
}

describe('account routes', () => {
  it('PATCH /accounts/uid/id/email validates and delegates', async () => {
    jest.mocked(updateEmail).mockResolvedValueOnce({ status: 'valid' })

    const server = await buildServer()

    const res = await server.inject({
      method: 'PATCH',
      url: '/accounts/uid-1/acc-id/email'
    })

    expect(res.statusCode).toBe(200)
    expect(res.result).toEqual({ status: 'valid' })
    expect(updateEmail).toHaveBeenCalledWith('uid-1', 'acc-id')
  })
})
