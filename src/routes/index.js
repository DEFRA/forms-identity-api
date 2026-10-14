import account from '~/src/routes/account.js'
import health from '~/src/routes/health.js'
import oidcStore from '~/src/routes/oidc-store.js'
import otp from '~/src/routes/otp.js'
import signin from '~/src/routes/signin.js'

export default [account, health, signin, oidcStore, otp].flat()
