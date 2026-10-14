import Hapi from '@hapi/hapi'

import accountRoutes from '~/src/routes/account.js'
import { updateEmail, updatePhone } from '~/src/services/account-service.js'

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

  it('PATCH /accounts/uid/id/phone validates and delegates', async () => {
    jest.mocked(updatePhone).mockResolvedValueOnce({ status: 'valid' })

    const server = await buildServer()

    const res = await server.inject({
      method: 'PATCH',
      url: '/accounts/uid-1/acc-id/phone',
      payload: { phone: '+447500123456' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.result).toEqual({ status: 'valid' })
    expect(updatePhone).toHaveBeenCalledWith('uid-1', 'acc-id', '+447500123456')
  })

  it('PATCH /accounts/uid/id/phone rejects text that is not a telephone number with 400', async () => {
    const server = await buildServer()

    const res = await server.inject({
      method: 'PATCH',
      url: '/accounts/uid-1/acc-id/phone',
      payload: { phone: 'not a number' }
    })

    expect(res.statusCode).toBe(400)
    expect(updatePhone).not.toHaveBeenCalled()
  })

  it('PATCH /accounts/uid/id/phone passes an Ofcom fictional number to the service (its rule)', async () => {
    jest.mocked(updatePhone).mockResolvedValueOnce({ status: 'valid' })

    const server = await buildServer()

    const res = await server.inject({
      method: 'PATCH',
      url: '/accounts/uid-1/acc-id/phone',
      payload: { phone: '07700900000' }
    })

    expect(res.statusCode).toBe(200)
    expect(updatePhone).toHaveBeenCalledWith('uid-1', 'acc-id', '07700900000')
  })
})
