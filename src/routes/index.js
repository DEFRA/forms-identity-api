import health from '~/src/routes/health.js'
import oidcStore from '~/src/routes/oidc-store.js'
import signin from '~/src/routes/signin.js'

export default [health, signin, oidcStore].flat()
