package com.mdm.app.security

import android.util.Log
import com.mdm.app.BuildConfig
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Certificate Pinning implementation for MDM server communication
 * Prevents Man-in-the-Middle (MITM) attacks by pinning server certificates
 *
 * Pin format: sha256/<base64-encoded-public-key-hash>
 */
object CertificatePinning {

    private const val TAG = "CertificatePinning"

    /**
     * Whether an unpinned client is acceptable.
     *
     * Release builds pin. Debug builds may run against a local server with a self-signed
     * certificate, so pinning is optional there — but it is still applied when pins are
     * supplied, rather than being switched off wholesale as it was before.
     */
    private val pinningRequired: Boolean get() = !BuildConfig.DEBUG

    private fun configuration(): PinConfiguration = PinConfiguration(
        host = BuildConfig.MDM_HOST,
        pins = listOf(BuildConfig.CERT_PIN_PRIMARY, BuildConfig.CERT_PIN_BACKUP),
        required = pinningRequired
    )

    /**
     * Build an OkHttp client with pinning applied.
     *
     * @throws IllegalStateException when pinning is required but not properly configured.
     *         Failing closed is the point: the previous implementation returned an
     *         unpinned client and logged a warning, so a release build with placeholder
     *         pins talked to the server over an unauthenticated TLS connection while the
     *         documentation said it was pinned.
     */
    fun createPinnedOkHttpClient(): OkHttpClient.Builder {
        val config = configuration()
        val problems = config.problems()

        if (problems.isNotEmpty()) {
            val detail = problems.joinToString("; ")
            Log.e(TAG, "Certificate pinning misconfigured: $detail")
            throw IllegalStateException(
                "Refusing to build an HTTP client without valid certificate pins: $detail"
            )
        }

        return OkHttpClient.Builder().apply {
            if (config.usablePins.isEmpty()) {
                // Debug only — `required` is false, so this is a deliberate local setup.
                Log.w(TAG, "No certificate pins configured; pinning is OFF for this debug build")
                return@apply
            }

            certificatePinner(certificatePinnerFor(config))
            Log.i(TAG, "Certificate pinning enabled for ${config.host} (${config.usablePins.size} pins)")
        }
    }

    private fun certificatePinnerFor(config: PinConfiguration): CertificatePinner =
        CertificatePinner.Builder().apply {
            config.usablePins.forEach { add(config.host, it) }
        }.build()

    /**
     * Compute the pin for a certificate, in the `sha256/<base64>` form OkHttp expects.
     *
     * Use this to read the pin off a server certificate when configuring a build:
     *   openssl s_client -connect host:443 | openssl x509 -pubkey -noout \
     *     | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
     *
     * The previous `verifyCertificatePins` computed this, logged it, and then returned
     * `true` unconditionally — it compared the result against nothing at all.
     */
    fun pinFor(certificate: X509Certificate): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(certificate.publicKey.encoded)
        return "sha256/" + android.util.Base64.encodeToString(digest, android.util.Base64.NO_WRAP)
    }

    /** Whether a certificate matches one of the configured pins. */
    fun matchesConfiguredPin(certificate: X509Certificate): Boolean {
        val pins = configuration().usablePins
        if (pins.isEmpty()) return false
        return pinFor(certificate) in pins
    }

    fun getDefaultTrustManager(): X509TrustManager {
        val trustManagerFactory = TrustManagerFactory.getInstance(
            TrustManagerFactory.getDefaultAlgorithm()
        )
        trustManagerFactory.init(null as? java.security.KeyStore?)

        for (trustManager in trustManagerFactory.trustManagers) {
            if (trustManager is X509TrustManager) {
                return trustManager
            }
        }

        throw IllegalStateException("No X509TrustManager found")
    }

    /**
     * Create SSL context with pinned certificates
     * For advanced pinning scenarios
     */
    fun createSSLContext(): SSLContext {
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(getDefaultTrustManager()), null)
        return sslContext
    }
}
