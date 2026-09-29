package com.mdm.app.policy

import com.mdm.app.models.DevicePolicy
import org.json.JSONArray
import org.json.JSONObject

/**
 * APPLY_FIELD_CONFIGURATION: turning an operator's field configuration into policy.
 *
 * Field configuration was simulated end to end. The server wrote log lines such as
 * "Configuring WiFi settings..." and marked every device COMPLETED without sending
 * anything, and the agent's own network and security steps logged "applied (mock
 * implementation)". Nothing was ever configured.
 *
 * A configuration is `{ section: { setting: value } }`. Each known section is handed to
 * [PolicyEngine] as a policy of the matching type, so every setting goes through the
 * same privilege check as any other policy and is reported individually: applied,
 * unsupported (with the privilege it needs), or not recognised. Nothing is reported as
 * done that was not done.
 */
object FieldConfiguration {

    /** Configuration section -> PolicyEngine policy type. */
    private val SECTION_TYPES = mapOf(
        "security" to "SECURITY",
        "network" to "NETWORK",
        "application" to "APPLICATION",
        "applications" to "APPLICATION",
        "hardware" to "HARDWARE",
        "system" to "SYSTEM",
        "compliance" to "COMPLIANCE"
    )

    data class Plan(
        val policies: List<DevicePolicy>,
        /** Settings refused before anything ran — unknown sections, malformed values. */
        val rejected: List<SettingOutcome>
    )

    fun plan(configurationId: String, configurations: Map<String, Any?>): Plan {
        val policies = mutableListOf<DevicePolicy>()
        val rejected = mutableListOf<SettingOutcome>()

        for ((section, value) in configurations) {
            val type = SECTION_TYPES[section.lowercase()]
            if (type == null) {
                rejected += SettingOutcome(section, PolicyStatus.UNSUPPORTED, "not a configuration section the agent recognises")
                continue
            }
            @Suppress("UNCHECKED_CAST")
            val rules = value as? Map<String, Any>
            if (rules == null) {
                rejected += SettingOutcome(section, PolicyStatus.ERROR, "section must be an object of settings")
                continue
            }
            policies += DevicePolicy(
                id = "$configurationId:$section",
                name = section,
                description = "Field configuration $configurationId",
                type = type,
                rules = rules,
                targetDevices = emptyList(),
                createdAt = "",
                updatedAt = ""
            )
        }
        return Plan(policies, rejected)
    }

    /**
     * Per-setting report. A setting present in the configuration that PolicyEngine did
     * not act on at all is reported as not recognised rather than silently dropped.
     */
    fun report(plan: Plan, results: List<PolicyApplicationResult>): List<SettingOutcome> {
        val report = plan.rejected.toMutableList()
        for (policy in plan.policies) {
            val result = results.firstOrNull { it.policyName == policy.name }
            val seen = result?.settings.orEmpty().associateBy { it.setting }
            for (key in policy.rules.keys) {
                val outcome = seen[key]
                report += outcome?.copy(setting = "${policy.name}.$key")
                    ?: SettingOutcome(
                        "${policy.name}.$key",
                        PolicyStatus.UNSUPPORTED,
                        "not a setting the agent recognises"
                    )
            }
        }
        return report
    }

    /** JSON payload -> the Map shape PolicyEngine expects (Gson-style: numbers as Double). */
    fun toMap(json: JSONObject?): Map<String, Any?> {
        if (json == null) return emptyMap()
        val out = linkedMapOf<String, Any?>()
        for (key in json.keys()) out[key] = normalise(json.opt(key))
        return out
    }

    private fun normalise(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> toMap(value)
        is JSONArray -> (0 until value.length()).map { normalise(value.opt(it)) }
        is Number -> value.toDouble()
        else -> value
    }
}
