package com.mdm.app.security

/**
 * Certificate pin configuration and validation (finding F-08).
 *
 * The previous implementation could never have pinned anything:
 *
 *   - `shouldEnablePinning()` returned a literal `false`.
 *   - All three pins were the placeholder strings `PINNED_CERT_HASH_HERE`,
 *     `PIN_PRODUCTION_BACKUP` and `DEV_CERT_HASH_HERE`.
 *   - `verifyCertificatePins()` computed a hash, logged it, and returned `true`
 *     regardless — it compared against nothing.
 *   - `AppConfig.CERTIFICATE_PINNING_ENABLED = true` was a dead constant nothing read.
 *
 * Meanwhile the project's security documents listed pinning as complete and NIST
 * SP 800-124 compliant.
 *
 * Two properties matter more than the mechanics. Pins are **supplied at build time**
 * rather than hardcoded, so rotating a certificate does not require a code change. And
 * configuration **fails closed**: if pinning is on but the pins are missing or malformed,
 * the client refuses to be built rather than quietly falling back to an unpinned
 * connection, which is the failure mode the old code had.
 *
 * This file is deliberately free of Android and OkHttp types so it can be unit tested.
 */

/** A pin as OkHttp expects it: `sha256/` followed by base64 of the SHA-256 SPKI hash. */
private val PIN_PATTERN = Regex("^sha256/[A-Za-z0-9+/]{43}=$")

/**
 * Placeholders that shipped in this repository. Treated as absent rather than as pins —
 * without this, "configured" pins that are really TODO markers would pass validation and
 * pinning would reject every connection in production, or worse, be silently skipped.
 */
private val PLACEHOLDERS = setOf(
    "PINNED_CERT_HASH_HERE",
    "PIN_PRODUCTION_BACKUP",
    "PIN_PRODUCTION_PRIMARY",
    "DEV_CERT_HASH_HERE",
    "PINNED_CERT_BACKUP_HERE",
    "CHANGEME",
    ""
)

object PinValidation {

    /** Whether a value is a real pin rather than a placeholder or an empty string. */
    fun isPlaceholder(pin: String?): Boolean {
        if (pin == null) return true
        val bare = pin.trim().removePrefix("sha256/")
        return bare.isEmpty() || PLACEHOLDERS.any { it.equals(bare, ignoreCase = true) }
    }

    /** Whether a value is structurally a usable SHA-256 SPKI pin. */
    fun isWellFormed(pin: String?): Boolean {
        if (pin == null || isPlaceholder(pin)) return false
        return PIN_PATTERN.matches(pin.trim())
    }

    /** Keep only pins that are real and well-formed. */
    fun usable(pins: List<String>): List<String> = pins.filter { isWellFormed(it) }
}

/**
 * The pins for one host, plus whether pinning is required.
 *
 * @param host the hostname pins apply to.
 * @param pins candidate pins, including any placeholders; filtered on construction.
 * @param required when true, a configuration with fewer than [MIN_PINS] usable pins is
 *        an error rather than a reason to skip pinning.
 */
data class PinConfiguration(
    val host: String,
    private val pins: List<String>,
    val required: Boolean
) {
    val usablePins: List<String> = PinValidation.usable(pins)

    /**
     * Problems with this configuration, empty when it is fit to use.
     *
     * A backup pin is not optional pedantry: pinning with a single pin means the fleet
     * loses contact with the server the moment that certificate is rotated, and these
     * tablets cannot be recalled easily to be re-provisioned.
     */
    fun problems(): List<String> {
        if (!required) return emptyList()

        val problems = mutableListOf<String>()

        if (usablePins.isEmpty()) {
            problems += "no usable certificate pins configured for $host " +
                "(supply mdmPinPrimary and mdmPinBackup at build time)"
        } else if (usablePins.size < MIN_PINS) {
            problems += "only ${usablePins.size} pin configured for $host; a backup pin is " +
                "required so certificate rotation does not strand the fleet"
        }

        pins.filter { it.isNotBlank() && !PinValidation.isWellFormed(it) }.forEach {
            problems += "pin for $host is not a valid sha256/<base64> value: $it"
        }

        return problems
    }

    val isUsable: Boolean get() = problems().isEmpty() && usablePins.isNotEmpty()

    companion object {
        /** Primary plus at least one backup, for rotation. */
        const val MIN_PINS = 2
    }
}
