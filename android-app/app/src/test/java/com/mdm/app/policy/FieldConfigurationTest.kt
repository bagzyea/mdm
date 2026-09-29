package com.mdm.app.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Field configuration used to report success for settings nothing had applied. These pin
 * the rule that every setting in a configuration comes back with its own outcome.
 */
class FieldConfigurationTest {

    @Test fun `known sections become policies of the matching type`() {
        val plan = FieldConfiguration.plan(
            "fc-1",
            mapOf(
                "security" to mapOf("screenLockTimeout" to 30000.0),
                "network" to mapOf("airplaneModeDisabled" to true)
            )
        )

        assertEquals(listOf("SECURITY", "NETWORK"), plan.policies.map { it.type })
        assertTrue(plan.rejected.isEmpty())
    }

    @Test fun `an unknown section is reported, not dropped`() {
        val plan = FieldConfiguration.plan("fc-1", mapOf("wifiMagic" to mapOf("x" to 1.0)))

        assertTrue(plan.policies.isEmpty())
        assertEquals("wifiMagic", plan.rejected.single().setting)
        assertEquals(PolicyStatus.UNSUPPORTED, plan.rejected.single().status)
    }

    @Test fun `a section that is not an object is an error`() {
        val plan = FieldConfiguration.plan("fc-1", mapOf("security" to "strict"))
        assertEquals(PolicyStatus.ERROR, plan.rejected.single().status)
    }

    @Test fun `every setting gets an outcome, including ones the engine ignored`() {
        val plan = FieldConfiguration.plan(
            "fc-1",
            mapOf("security" to mapOf("screenLockTimeout" to 30000.0, "madeUpSetting" to true))
        )
        val engineResult = PolicyApplicationResult(
            policyName = "security",
            status = PolicyStatus.SUCCESS,
            message = "",
            settings = listOf(SettingOutcome("screenLockTimeout", PolicyStatus.SUCCESS, null))
        )

        val report = FieldConfiguration.report(plan, listOf(engineResult)).associateBy { it.setting }

        assertEquals(PolicyStatus.SUCCESS, report["security.screenLockTimeout"]?.status)
        assertEquals(PolicyStatus.UNSUPPORTED, report["security.madeUpSetting"]?.status)
        assertEquals(2, report.size)
    }
}
