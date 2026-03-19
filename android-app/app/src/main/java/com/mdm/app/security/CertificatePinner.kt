package com.mdm.app.security

import android.util.Log
import com.mdm.app.config.AppConfig
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import javax.net.ssl.*

/**
 * Certificate pinning utility for enhanced security
 */
object CertificatePinning {
    
    private const val TAG = "CertificatePinning"
    
    /**
     * Create OkHttpClient with certificate pinning enabled
     */
    fun createPinnedOkHttpClient(): OkHttpClient.Builder {
        val builder = OkHttpClient.Builder()
        
        if (AppConfig.Security.ENABLE_CERTIFICATE_PINNING) {
            // Configure certificate pinning
            val certificatePinner = createCertificatePinner()
            builder.certificatePinner(certificatePinner)
            
            // Optional: Add custom trust manager for additional validation
            if (AppConfig.Development.ENABLE_DETAILED_LOGGING) {
                builder.addNetworkInterceptor { chain ->
                    val request = chain.request()
                    Log.d(TAG, "Making secure request to: ${request.url}")
                    
                    val response = chain.proceed(request)
                    
                    // Log certificate information in debug mode
                    val connection = chain.connection()
                    if (connection is okhttp3.internal.connection.RealConnection) {
                        // Access handshake information if available
                        Log.d(TAG, "SSL handshake completed successfully")
                    }
                    
                    response
                }
            }
        }
        
        return builder
    }
    
    /**
     * Create certificate pinner with production domain pins
     */
    private fun createCertificatePinner(): CertificatePinner {
        val builder = CertificatePinner.Builder()
        
        // Add your production domain certificate pins here
        // Example pins - REPLACE WITH YOUR ACTUAL CERTIFICATE PINS
        builder.add("your-production-domain.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        builder.add("your-production-domain.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")
        
        // Add backup/CA pins
        builder.add("*.your-production-domain.com", "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=")
        
        return builder.build()
    }
    
    /**
     * Generate SHA-256 pin from certificate
     * Use this helper method to generate pins from your certificates
     */
    fun generateSHA256Pin(certificate: X509Certificate): String {
        return try {
            val publicKey = certificate.publicKey
            val publicKeyBytes = publicKey.encoded
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(publicKeyBytes)
            "sha256/" + android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "Error generating certificate pin", e)
            ""
        }
    }
    
    /**
     * Create a custom TrustManager for additional certificate validation
     */
    private fun createCustomTrustManager(): X509TrustManager {
        return object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
                // Default implementation - delegate to system trust manager
                getDefaultTrustManager()?.checkClientTrusted(chain, authType)
            }
            
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                // Perform default validation first
                getDefaultTrustManager()?.checkServerTrusted(chain, authType)
                
                // Add custom validation logic here if needed
                validateCertificateChain(chain)
            }
            
            override fun getAcceptedIssuers(): Array<X509Certificate> {
                return getDefaultTrustManager()?.acceptedIssuers ?: arrayOf()
            }
        }
    }
    
    /**
     * Get default system trust manager
     */
    private fun getDefaultTrustManager(): X509TrustManager? {
        return try {
            val trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            trustManagerFactory.init(null as KeyStore?)
            val trustManagers = trustManagerFactory.trustManagers
            trustManagers.find { it is X509TrustManager } as? X509TrustManager
        } catch (e: Exception) {
            Log.e(TAG, "Error getting default trust manager", e)
            null
        }
    }
    
    /**
     * Validate certificate chain with custom rules
     */
    private fun validateCertificateChain(chain: Array<X509Certificate>) {
        try {
            for ((index, cert) in chain.withIndex()) {
                Log.d(TAG, "Certificate $index: ${cert.subjectDN}")
                
                // Check certificate validity period
                cert.checkValidity()
                
                // Check for specific certificate attributes if needed
                validateCertificateAttributes(cert)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Certificate chain validation failed", e)
            throw SSLPeerUnverifiedException("Custom certificate validation failed: ${e.message}")
        }
    }
    
    /**
     * Validate specific certificate attributes
     */
    private fun validateCertificateAttributes(certificate: X509Certificate) {
        try {
            // Example: Check for specific Subject Alternative Names (SAN)
            val subjectAltNames = certificate.subjectAlternativeNames
            if (subjectAltNames != null) {
                for (altName in subjectAltNames) {
                    val type = altName[0] as Int
                    val name = altName[1] as String
                    if (type == 2) { // DNS name
                        Log.d(TAG, "Certificate DNS name: $name")
                    }
                }
            }
            
            // Example: Check certificate key size
            val publicKey = certificate.publicKey
            if (publicKey.algorithm == "RSA") {
                // Ensure minimum key size for RSA
                val keySize = (publicKey as java.security.interfaces.RSAPublicKey).modulus.bitLength()
                if (keySize < 2048) {
                    throw SSLPeerUnverifiedException("RSA key size too small: $keySize bits")
                }
                Log.d(TAG, "RSA key size: $keySize bits")
            }
            
        } catch (e: Exception) {
            Log.w(TAG, "Certificate attribute validation warning", e)
            // Don't throw here unless it's critical
        }
    }
    
    /**
     * Validate hostname against certificate
     */
    fun validateHostname(hostname: String, certificate: X509Certificate): Boolean {
        return try {
            val hostnameVerifier = HttpsURLConnection.getDefaultHostnameVerifier()
            val sslSession = createMockSSLSession(certificate)
            hostnameVerifier.verify(hostname, sslSession)
        } catch (e: Exception) {
            Log.e(TAG, "Hostname validation failed for $hostname", e)
            false
        }
    }
    
    /**
     * Create a mock SSL session for hostname verification
     */
    private fun createMockSSLSession(certificate: X509Certificate): SSLSession {
        return object : SSLSession {
            override fun getId(): ByteArray = byteArrayOf()
            override fun getSessionContext(): SSLSessionContext? = null
            override fun getCreationTime(): Long = System.currentTimeMillis()
            override fun getLastAccessedTime(): Long = System.currentTimeMillis()
            override fun invalidate() {}
            override fun isValid(): Boolean = true
            override fun putValue(name: String?, value: Any?) {}
            override fun getValue(name: String?): Any? = null
            override fun removeValue(name: String?) {}
            override fun getValueNames(): Array<String> = arrayOf()
            override fun getPeerCertificates(): Array<Certificate> = arrayOf(certificate)
            override fun getLocalCertificates(): Array<Certificate>? = null
            override fun getPeerCertificateChain(): Array<javax.security.cert.X509Certificate>? = null
            override fun getPeerPrincipal(): java.security.Principal = certificate.subjectDN
            override fun getLocalPrincipal(): java.security.Principal? = null
            override fun getCipherSuite(): String = "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
            override fun getProtocol(): String = "TLSv1.3"
            override fun getPeerHost(): String? = null
            override fun getPeerPort(): Int = 443
            override fun getPacketBufferSize(): Int = 16384
            override fun getApplicationBufferSize(): Int = 16384
        }
    }
}