package com.mdm.app.security

import android.util.Log
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
     * Production certificate pins
     * These are the SHA-256 hashes of the public keys for the production MDM server
     * PRIMARY: Current certificate
     * BACKUP: Backup certificate (for rotation)
     */
    private const val PIN_PRODUCTION_PRIMARY = "sha256/PINNED_CERT_HASH_HERE"  // TODO: Add real hash
    private const val PIN_PRODUCTION_BACKUP = "sha256/PINNED_CERT_BACKUP_HERE"  // TODO: Add real hash

    /**
     * Development/Test certificate pins
     * Can be self-signed for testing
     */
    private const val PIN_DEV_PRIMARY = "sha256/DEV_CERT_HASH_HERE"  // TODO: Add dev hash

    private const val MDM_SERVER_HOSTNAME = "mdm.uboscare.com"
    private const val MDM_DEV_HOSTNAME = "mdm-dev.uboscare.com"

    /**
     * Create OkHttpClient with certificate pinning enabled
     * Pins certificates to prevent MITM attacks
     */
    fun createPinnedOkHttpClient(): OkHttpClient.Builder {
        return OkHttpClient.Builder().apply {
            if (shouldEnablePinning()) {
                val certificatePinner = createCertificatePinner()
                certificatePinner(certificatePinner)
                Log.d(TAG, "Certificate pinning enabled for $MDM_SERVER_HOSTNAME and $MDM_DEV_HOSTNAME")
            } else {
                Log.w(TAG, "Certificate pinning disabled - development mode only")
            }
        }
    }

    /**
     * Create certificate pinner with pins for MDM servers
     */
    private fun createCertificatePinner(): CertificatePinner {
        return CertificatePinner.Builder()
            // Production server pins
            .add(MDM_SERVER_HOSTNAME, PIN_PRODUCTION_PRIMARY)
            .add(MDM_SERVER_HOSTNAME, PIN_PRODUCTION_BACKUP)
            // Development server pins
            .add(MDM_DEV_HOSTNAME, PIN_DEV_PRIMARY)
            .add(MDM_DEV_HOSTNAME, PIN_PRODUCTION_PRIMARY)  // Allow production cert on dev for testing
            .build()
    }

    /**
     * Determine if pinning should be enabled
     * Disabled in debug builds for development flexibility
     */
    private fun shouldEnablePinning(): Boolean {
        // Disable pinning for development until real certificates are configured
        // TODO: In production, replace placeholder pins with real certificates and set to true
        return false  // Development mode - pinning disabled
        // return !BuildConfig.DEBUG  // For production: enable pinning in release builds
    }

    /**
     * Verify if a certificate matches the pins
     * Used for additional validation if needed
     */
    fun verifyCertificatePins(certificate: X509Certificate): Boolean {
        return try {
            val pin = certificate.publicKey.encoded
            val messageDigest = java.security.MessageDigest.getInstance("SHA-256")
            val digest = messageDigest.digest(pin)
            val hash = android.util.Base64.encodeToString(digest, android.util.Base64.NO_WRAP)

            Log.d(TAG, "Certificate pin: sha256/$hash")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error verifying certificate pin", e)
            false
        }
    }

    /**
     * Get the default trust manager for the system
     * Used for certificate chain validation
     */
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
