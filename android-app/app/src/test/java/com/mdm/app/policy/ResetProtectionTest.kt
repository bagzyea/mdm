package com.mdm.app.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ResetProtectionTest {

    private fun invalidReason(value: Any?): String {
        val parsed = ResetProtection.parse(value)
        assertTrue("expected Invalid, got $parsed", parsed is ResetProtection.Parsed.Invalid)
        return (parsed as ResetProtection.Parsed.Invalid).reason
    }

    @Test
    fun `accepts account IDs given as strings or numbers, without duplicates`() {
        val parsed = ResetProtection.parse(listOf("112233445566778899", 112233445566L, " 112233445566778899 "))
        assertEquals(
            ResetProtection.Parsed.Accounts(listOf("112233445566778899", "112233445566")),
            parsed
        )
    }

    @Test
    fun `refuses an email address, which would match no account and lock the tablet for good`() {
        assertTrue(invalidReason(listOf("it@ubos.org")).contains("email address"))
    }

    @Test
    fun `refuses an empty list, a non-list and malformed IDs`() {
        assertTrue(invalidReason(emptyList<String>()).contains("at least one"))
        assertTrue(invalidReason("112233445566").contains("list"))
        assertTrue(invalidReason(listOf("12ab")).contains("not a Google account ID"))
        assertTrue(invalidReason(listOf(mapOf("id" to 1))).contains("list"))
    }

    @Test
    fun `refuses more accounts than an organisation needs`() {
        val many = (1..11).map { "1000000000$it" }
        assertTrue(invalidReason(many).contains("at most"))
    }
}
