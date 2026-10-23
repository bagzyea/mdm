package com.mdm.app.policy

import org.junit.Assert.*
import org.junit.Test

/**
 * Honest policy reporting (finding F-07).
 *
 * PolicyEngine guarded every call with `isAdminActive()`, which reports only that a
 * Device Admin receiver is enabled — while most of what it called requires Device Owner.
 * Those calls threw, the exception was caught, and a result object was returned, so the
 * dashboard showed policies as applied when nothing had been applied.
 *
 * These tests pin the reporting rules, which is where that dishonesty lived. They need no
 * Android framework: the privilege comparison and the outcome collapse are pure logic.
 */
class PrivilegeLevelTest {

    @Test
    fun `device owner satisfies every requirement`() {
        for (required in PrivilegeLevel.values()) {
            assertTrue(
                "DEVICE_OWNER should satisfy $required",
                PrivilegeLevel.DEVICE_OWNER.satisfies(required)
            )
        }
    }

    @Test
    fun `device admin does not satisfy device owner`() {
        // This is the exact confusion behind F-07.
        assertFalse(PrivilegeLevel.DEVICE_ADMIN.satisfies(PrivilegeLevel.DEVICE_OWNER))
        assertFalse(PrivilegeLevel.DEVICE_ADMIN.satisfies(PrivilegeLevel.PROFILE_OWNER))
    }

    @Test
    fun `device admin satisfies device admin`() {
        assertTrue(PrivilegeLevel.DEVICE_ADMIN.satisfies(PrivilegeLevel.DEVICE_ADMIN))
    }

    @Test
    fun `profile owner sits between admin and device owner`() {
        assertTrue(PrivilegeLevel.PROFILE_OWNER.satisfies(PrivilegeLevel.DEVICE_ADMIN))
        assertFalse(PrivilegeLevel.PROFILE_OWNER.satisfies(PrivilegeLevel.DEVICE_OWNER))
    }

    @Test
    fun `none satisfies nothing except none`() {
        assertTrue(PrivilegeLevel.NONE.satisfies(PrivilegeLevel.NONE))
        assertFalse(PrivilegeLevel.NONE.satisfies(PrivilegeLevel.DEVICE_ADMIN))
        assertFalse(PrivilegeLevel.NONE.satisfies(PrivilegeLevel.DEVICE_OWNER))
    }
}

class PolicyOutcomeTest {

    @Test
    fun `a setting above the held privilege is not attempted`() {
        var attempted = false

        val outcome = PolicyOutcome("kiosk", PrivilegeLevel.DEVICE_ADMIN)
        outcome.setting("lockTaskPackages", PrivilegeLevel.DEVICE_OWNER) { attempted = true }

        // Not attempted at all — attempting and catching is how the failure became invisible.
        assertFalse("must not attempt a call above the held privilege", attempted)

        val result = outcome.result()
        assertEquals(PolicyStatus.UNSUPPORTED, result.status)
        assertEquals(1, result.settings.size)
        assertEquals(PolicyStatus.UNSUPPORTED, result.settings[0].status)
    }

    @Test
    fun `the reason names both the required and the held privilege`() {
        val outcome = PolicyOutcome("kiosk", PrivilegeLevel.DEVICE_ADMIN)
        outcome.setting("lockTaskPackages", PrivilegeLevel.DEVICE_OWNER) { }

        val message = outcome.result().settings[0].message ?: ""
        assertTrue("should name what is required: $message", message.contains("DEVICE_OWNER"))
        assertTrue("should name what is held: $message", message.contains("DEVICE_ADMIN"))
    }

    @Test
    fun `a setting within the held privilege is applied`() {
        var attempted = false

        val outcome = PolicyOutcome("security", PrivilegeLevel.DEVICE_OWNER)
        outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) { attempted = true }

        assertTrue(attempted)
        assertEquals(PolicyStatus.SUCCESS, outcome.result().status)
    }

    @Test
    fun `a platform refusal is reported, not swallowed`() {
        val outcome = PolicyOutcome("security", PrivilegeLevel.DEVICE_OWNER)
        outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) {
            throw SecurityException("not allowed")
        }

        val result = outcome.result()
        assertEquals(PolicyStatus.UNSUPPORTED, result.status)
        assertTrue(result.message.contains("cameraDisabled"))
    }

    @Test
    fun `a setting the tablet does not implement is unsupported, not an error or a success`() {
        // setFactoryResetProtectionPolicy throws this on models without FRP support.
        val outcome = PolicyOutcome("system", PrivilegeLevel.DEVICE_OWNER)
        outcome.setting(ResetProtection.RULE, PrivilegeLevel.DEVICE_OWNER) {
            throw UnsupportedOperationException("FRP not supported")
        }

        val result = outcome.result()
        assertEquals(PolicyStatus.UNSUPPORTED, result.status)
        assertTrue(result.message.contains(ResetProtection.RULE))
    }

    @Test
    fun `an unexpected failure is an error, not a success`() {
        val outcome = PolicyOutcome("security", PrivilegeLevel.DEVICE_OWNER)
        outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) {
            throw IllegalStateException("device busy")
        }

        assertEquals(PolicyStatus.ERROR, outcome.result().status)
    }

    @Test
    fun `a partially applied policy does not report success`() {
        // The case that mattered: some settings take, some silently do not.
        val outcome = PolicyOutcome("mixed", PrivilegeLevel.DEVICE_ADMIN)
        outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) { }
        outcome.setting("factoryResetDisabled", PrivilegeLevel.DEVICE_OWNER) { }

        val result = outcome.result()
        assertEquals(PolicyStatus.UNSUPPORTED, result.status)
        assertTrue("should name the setting that did not apply", result.message.contains("factoryResetDisabled"))
        assertTrue("should say one applied", result.message.contains("1 applied"))
    }

    @Test
    fun `an error outranks an unsupported setting`() {
        val outcome = PolicyOutcome("mixed", PrivilegeLevel.DEVICE_ADMIN)
        outcome.setting("factoryResetDisabled", PrivilegeLevel.DEVICE_OWNER) { }
        outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) { throw RuntimeException("boom") }

        assertEquals(PolicyStatus.ERROR, outcome.result().status)
    }

    @Test
    fun `a policy with no recognised settings is unsupported, not successful`() {
        // Previously an empty rule set fell through to "applied successfully".
        val outcome = PolicyOutcome("empty", PrivilegeLevel.DEVICE_OWNER)

        val result = outcome.result()
        assertEquals(PolicyStatus.UNSUPPORTED, result.status)
        assertTrue(result.settings.isEmpty())
    }

    @Test
    fun `every setting is reported individually`() {
        val outcome = PolicyOutcome("many", PrivilegeLevel.DEVICE_OWNER)
        outcome.setting("a", PrivilegeLevel.DEVICE_ADMIN) { }
        outcome.setting("b", PrivilegeLevel.DEVICE_ADMIN) { }
        outcome.unsupported("c", "not implemented on this build")

        val result = outcome.result()
        assertEquals(3, result.settings.size)
        assertEquals(listOf("a", "b", "c"), result.settings.map { it.setting })
    }
}
