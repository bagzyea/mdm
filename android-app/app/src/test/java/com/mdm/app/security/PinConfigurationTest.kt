package com.mdm.app.security

import org.junit.Assert.*
import org.junit.Test

/**
 * Certificate pin configuration (finding F-08).
 *
 * The previous implementation could not have pinned anything: `shouldEnablePinning()`
 * returned a literal false, every pin was a placeholder string, and
 * `verifyCertificatePins()` returned true without comparing against anything — while the
 * project's security documents listed pinning as complete and NIST SP 800-124 compliant.
 *
 * The property these tests protect is that the configuration **fails closed**. An
 * unpinned release build is the outcome that must be impossible.
 */
class PinValidationTest {

    private val realPin = "sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg="
    private val otherPin = "sha256/Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys="

    @Test
    fun `a real pin is well formed`() {
        assertTrue(PinValidation.isWellFormed(realPin))
        assertFalse(PinValidation.isPlaceholder(realPin))
    }

    @Test
    fun `the placeholders that shipped in this repository are rejected`() {
        // These were the actual values in CertificatePinning.kt.
        val shipped = listOf(
            "sha256/PINNED_CERT_HASH_HERE",
            "sha256/PIN_PRODUCTION_BACKUP",
            "sha256/DEV_CERT_HASH_HERE",
            "sha256/PINNED_CERT_BACKUP_HERE"
        )

        for (pin in shipped) {
            assertTrue("$pin should be recognised as a placeholder", PinValidation.isPlaceholder(pin))
            assertFalse("$pin must not be treated as usable", PinValidation.isWellFormed(pin))
        }
    }

    @Test
    fun `empty and null are placeholders`() {
        assertTrue(PinValidation.isPlaceholder(null))
        assertTrue(PinValidation.isPlaceholder(""))
        assertTrue(PinValidation.isPlaceholder("   "))
        assertTrue(PinValidation.isPlaceholder("sha256/"))
    }

    @Test
    fun `a pin missing its algorithm prefix is malformed`() {
        assertFalse(PinValidation.isWellFormed("YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg="))
    }

    @Test
    fun `a truncated or overlong digest is malformed`() {
        assertFalse(PinValidation.isWellFormed("sha256/tooshort="))
        assertFalse(PinValidation.isWellFormed("sha256/${"A".repeat(60)}="))
    }

    @Test
    fun `sha1 pins are not accepted`() {
        assertFalse(PinValidation.isWellFormed("sha1/YLh1dUR9y6Kja30RrAn7JKnbQG8="))
    }

    @Test
    fun `usable filters out placeholders and keeps real pins`() {
        val mixed = listOf(realPin, "sha256/PINNED_CERT_HASH_HERE", "", otherPin)
        assertEquals(listOf(realPin, otherPin), PinValidation.usable(mixed))
    }
}

class PinConfigurationTest {

    private val realPin = "sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg="
    private val backupPin = "sha256/Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys="

    @Test
    fun `a primary and backup pin is a usable configuration`() {
        val config = PinConfiguration("mdm.uboscare.com", listOf(realPin, backupPin), required = true)

        assertEquals(emptyList<String>(), config.problems())
        assertTrue(config.isUsable)
        assertEquals(2, config.usablePins.size)
    }

    @Test
    fun `placeholder pins are a problem when pinning is required`() {
        // This is exactly the shipped configuration: pinning nominally on, pins fake.
        val config = PinConfiguration(
            "mdm.uboscare.com",
            listOf("sha256/PINNED_CERT_HASH_HERE", "sha256/PIN_PRODUCTION_BACKUP"),
            required = true
        )

        assertFalse(config.isUsable)
        assertTrue(config.problems().any { it.contains("no usable certificate pins") })
    }

    @Test
    fun `a single pin is rejected because rotation would strand the fleet`() {
        val config = PinConfiguration("mdm.uboscare.com", listOf(realPin), required = true)

        assertFalse(config.isUsable)
        assertTrue(config.problems().any { it.contains("backup pin is required") })
    }

    @Test
    fun `a malformed pin is reported rather than silently dropped`() {
        val config = PinConfiguration(
            "mdm.uboscare.com",
            listOf(realPin, backupPin, "sha256/not-a-real-digest"),
            required = true
        )

        assertTrue(config.problems().any { it.contains("not a valid sha256") })
    }

    @Test
    fun `pinning not required means no pins is acceptable`() {
        // Debug builds against a local server with a self-signed certificate.
        val config = PinConfiguration("localhost", listOf("", ""), required = false)

        assertEquals(emptyList<String>(), config.problems())
        assertTrue(config.usablePins.isEmpty())
    }

    @Test
    fun `pinning not required still uses pins when they are supplied`() {
        val config = PinConfiguration("localhost", listOf(realPin, backupPin), required = false)
        assertEquals(2, config.usablePins.size)
    }
}
