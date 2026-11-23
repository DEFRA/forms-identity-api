import { auditRegistration } from '~/src/lib/audit.js'
import { runInTransaction } from '~/src/lib/transaction.js'
import * as accountsRepository from '~/src/repositories/accounts-repository.js'
import { buildAccount } from '~/src/services/signin-service.js'

/**
 * Creates an account. The insert and its registration audit commit
 * together, so a failed audit publish leaves no account behind. On a
 * duplicate email (racing interaction, or a crash-retry after creation but
 * before the OTP was consumed) the unique index rejects the insert and the
 * existing account is returned instead — the caller signs that account in.
 * @param {string} email
 * @param {string} phone - E.164
 */
export async function createAccount(email, phone) {
  const account = buildAccount(email, phone)

  try {
    await runInTransaction(async (session) => {
      await accountsRepository.insert(account, session)
      await auditRegistration(account._id, account.email, account.phone)
    })
  } catch (err) {
    if (accountsRepository.isDuplicateKeyError(err)) {
      const existing = await accountsRepository.findByEmail(email.toLowerCase())
      if (existing) {
        return existing
      }
    }
    throw err
  }

  return account
}
