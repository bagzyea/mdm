package com.mdm.app.policy

import com.mdm.app.util.AgentLog

/**
 * Per-setting outcome recording for policy application (finding F-07).
 *
 * Each `applyXPolicy` previously wrapped an entire block of settings in one try/catch and
 * returned a single SUCCESS if nothing threw. That hid two things: a setting that threw
 * `SecurityException` because the app lacks Device Owner, and a setting the platform
 * accepted but silently ignored. Either way the server was told the policy applied.
 *
 * Recording each setting separately means a partially-applied policy reports as partially
 * applied, and names which settings did not take.
 */
class PolicyOutcome(
    private val policyName: String,
    private val held: PrivilegeLevel
) {
    private val settings = mutableListOf<SettingOutcome>()

    /**
     * Apply one setting, recording what actually happened.
     *
     * @param name the rule key, as the server sent it, so results line up with the policy.
     * @param requires the privilege the platform demands for this call. If the app does
     *        not hold it the call is **not attempted** — attempting and catching is how
     *        the failure became invisible.
     */
    fun setting(name: String, requires: PrivilegeLevel, block: () -> Unit) {
        if (!held.satisfies(requires)) {
            settings += SettingOutcome(
                name,
                PolicyStatus.UNSUPPORTED,
                DevicePrivilege.explain(held, requires)
            )
            AgentLog.w(TAG, "$policyName/$name not applied: insufficient privilege ($held < $requires)")
            return
        }

        try {
            block()
            settings += SettingOutcome(name, PolicyStatus.SUCCESS, null)
        } catch (e: SecurityException) {
            // The platform refused despite the privilege check — report it rather than
            // letting the policy still claim success.
            settings += SettingOutcome(name, PolicyStatus.UNSUPPORTED, "refused by platform: ${e.message}")
            AgentLog.w(TAG, "$policyName/$name refused by platform", e)
        } catch (e: Exception) {
            settings += SettingOutcome(name, PolicyStatus.ERROR, e.message ?: e::class.java.simpleName)
            AgentLog.e(TAG, "$policyName/$name failed", e)
        }
    }

    /** Record a setting that this build does not implement at all. */
    fun unsupported(name: String, why: String) {
        settings += SettingOutcome(name, PolicyStatus.UNSUPPORTED, why)
    }

    /**
     * Collapse to a single result.
     *
     * SUCCESS only when every attempted setting applied. Any error makes the policy an
     * error; anything unapplied makes it UNSUPPORTED. A policy that asked for nothing this
     * build understands is UNSUPPORTED, not a success.
     */
    fun result(): PolicyApplicationResult {
        val errors = settings.count { it.status == PolicyStatus.ERROR }
        val unsupported = settings.count { it.status == PolicyStatus.UNSUPPORTED }
        val applied = settings.count { it.status == PolicyStatus.SUCCESS }

        val status = when {
            errors > 0 -> PolicyStatus.ERROR
            unsupported > 0 -> PolicyStatus.UNSUPPORTED
            applied > 0 -> PolicyStatus.SUCCESS
            else -> PolicyStatus.UNSUPPORTED
        }

        val message = when (status) {
            PolicyStatus.SUCCESS -> "Applied $applied setting(s)"
            PolicyStatus.ERROR ->
                "$applied applied, $unsupported unsupported, $errors failed: " +
                    settings.filter { it.status == PolicyStatus.ERROR }
                        .joinToString("; ") { "${it.setting} (${it.message})" }
            PolicyStatus.UNSUPPORTED ->
                if (applied == 0 && settings.isEmpty()) {
                    "No settings in this policy are supported by this build"
                } else {
                    "$applied applied, $unsupported not applied: " +
                        settings.filter { it.status == PolicyStatus.UNSUPPORTED }
                            .joinToString("; ") { "${it.setting} (${it.message})" }
                }
            PolicyStatus.PENDING -> "Pending"
        }

        return PolicyApplicationResult(policyName, status, message, settings.toList())
    }

    private companion object {
        const val TAG = "PolicyOutcome"
    }
}

/** The outcome of one rule within a policy. */
data class SettingOutcome(
    val setting: String,
    val status: PolicyStatus,
    val message: String?
)
