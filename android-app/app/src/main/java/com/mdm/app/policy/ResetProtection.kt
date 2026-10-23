package com.mdm.app.policy

/**
 * Organisation Factory Reset Protection (policy rule `factoryResetProtectionAccounts`).
 *
 * Tablets belong to UBOS but were set up with enumerators' personal Google accounts.
 * After a reset, Android's Factory Reset Protection then asks for that person's account,
 * and the tablet is unusable until they can be found. With an organisation FRP policy
 * (Android 11+, Device Owner) only the listed UBOS Google accounts can unlock a reset
 * tablet; whoever was signed in last cannot lock UBOS out.
 *
 * The policy takes Google account IDs: the long number Google assigns to an account,
 * not its email address. For an account, the People API's `people/me` returns it as
 * `resourceName: "people/<id>"` (see docs/android-agent.md).
 *
 * This object only validates the rule; [PolicyEngine] applies it.
 */
object ResetProtection {

    const val RULE = "factoryResetProtectionAccounts"

    /** At least one account is required; a short list is all an organisation needs. */
    const val MAX_ACCOUNTS = 10

    private val ACCOUNT_ID = Regex("^\\d{5,32}$")

    sealed class Parsed {
        data class Accounts(val ids: List<String>) : Parsed()
        data class Invalid(val reason: String) : Parsed()
    }

    /**
     * Accepts a list of account IDs as strings or numbers. Rejects emails, because the
     * platform would accept them without complaint and then match no account, leaving
     * a reset tablet that nobody can unlock.
     */
    fun parse(value: Any?): Parsed {
        val items = value as? List<*> ?: return Parsed.Invalid("expected a list of Google account IDs")
        val ids = items.map { item ->
            when (item) {
                is String -> item.trim()
                is Number -> item.toLong().toString()
                else -> return Parsed.Invalid("expected a list of Google account IDs")
            }
        }.distinct()

        if (ids.isEmpty()) {
            return Parsed.Invalid("at least one UBOS Google account ID is required")
        }
        if (ids.size > MAX_ACCOUNTS) {
            return Parsed.Invalid("at most $MAX_ACCOUNTS accounts")
        }
        ids.firstOrNull { it.contains('@') }?.let {
            return Parsed.Invalid("\"$it\" is an email address; the policy needs the account's numeric ID")
        }
        ids.firstOrNull { !ACCOUNT_ID.matches(it) }?.let {
            return Parsed.Invalid("\"$it\" is not a Google account ID (a number of 5 to 32 digits)")
        }
        return Parsed.Accounts(ids)
    }
}
