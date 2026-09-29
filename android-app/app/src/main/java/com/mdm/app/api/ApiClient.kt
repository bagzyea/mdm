package com.mdm.app.api

import android.content.Context
import com.google.gson.GsonBuilder
import com.mdm.app.config.AppConfig
import com.mdm.app.security.CertificatePinning
import com.mdm.app.utils.PreferenceManager
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * API client for MDM server communication
 */
class ApiClient private constructor(private val context: Context) {
    
    companion object {
        @Volatile
        private var INSTANCE: ApiClient? = null
        
        private const val RETRIED_HEADER = "X-MDM-Token-Retry"

        fun getInstance(context: Context): ApiClient {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ApiClient(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private val preferenceManager = PreferenceManager.getInstance(context)
    private val gson = GsonBuilder()
        .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .create()
    
    private val authInterceptor = Interceptor { chain ->
        val original = chain.request()
        val requestBuilder = original.newBuilder()
        
        // Add device token for authentication
        val deviceToken = preferenceManager.getDeviceToken()
        if (!deviceToken.isNullOrEmpty()) {
            requestBuilder.addHeader("Authorization", "Bearer $deviceToken")
        }
        
        // Add device ID header
        val deviceId = preferenceManager.getDeviceId()
        if (!deviceId.isNullOrEmpty()) {
            requestBuilder.addHeader("X-Device-ID", deviceId)
        }
        
        // Add common headers
        requestBuilder.addHeader("User-Agent", "MDM-Android/1.0")
        requestBuilder.addHeader("Content-Type", "application/json")
        
        chain.proceed(requestBuilder.build())
    }
    
    // Use emulator URL for debug builds, production URL for release builds
    private val baseUrl = if (AppConfig.Development.ENABLE_DEBUG_LOGGING) {
        AppConfig.Server.BASE_API_URL_EMULATOR + "/api/"
    } else {
        AppConfig.Server.BASE_API_URL + "/api/"
    }

    /** Shared with WebSocketClient, which refreshes before reconnecting. */
    val tokenRefresher = TokenRefresher(
        store = preferenceManager,
        refreshUrl = baseUrl + "devices/token/refresh",
        // Pinned, but without authInterceptor or tokenAuthenticator: refreshing must not
        // recurse into itself.
        httpClient = CertificatePinning.createPinnedOkHttpClient()
            .connectTimeout(AppConfig.Server.CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS)
            .readTimeout(AppConfig.Server.READ_TIMEOUT, TimeUnit.MILLISECONDS)
            .build()
    )

    /**
     * On a 401, renew the access token once and replay the request. The server answers an
     * expired device token with 401 (see backend src/middleware/deviceAuth.ts).
     */
    private val tokenAuthenticator = Authenticator { _, response ->
        val request = response.request
        val path = request.url.encodedPath
        if (request.header(RETRIED_HEADER) != null ||
            path.endsWith("/devices/enroll") ||
            path.endsWith("/token/refresh")
        ) {
            return@Authenticator null
        }

        val staleToken = request.header("Authorization")?.removePrefix("Bearer ")
        when (tokenRefresher.refresh(staleToken)) {
            TokenRefresher.Outcome.REFRESHED -> request.newBuilder()
                .header("Authorization", "Bearer ${preferenceManager.getDeviceToken()}")
                .header(RETRIED_HEADER, "1")
                .build()
            else -> null
        }
    }

    private val okHttpClient = createSecureOkHttpClient()
    
    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    val mdmApiService: MDMApiService by lazy {
        retrofit.create(MDMApiService::class.java)
    }

    /**
     * Get the current server URL (read-only, for display only)
     */
    fun getServerUrl(): String = AppConfig.Server.BASE_API_URL
    
    /**
     * Update device token
     */
    fun updateDeviceToken(token: String) {
        preferenceManager.setDeviceToken(token)
    }
    
    /**
     * Clear authentication data
     */
    fun clearAuth() {
        preferenceManager.clearDeviceToken()
        preferenceManager.clearDeviceId()
    }
    
    /**
     * Create secure OkHttpClient with certificate pinning
     */
    private fun createSecureOkHttpClient(): OkHttpClient {
        val builder = CertificatePinning.createPinnedOkHttpClient()
            .addInterceptor(authInterceptor)
            .authenticator(tokenAuthenticator)
            .connectTimeout(AppConfig.Server.CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS)
            .readTimeout(AppConfig.Server.READ_TIMEOUT, TimeUnit.MILLISECONDS)
            .writeTimeout(AppConfig.Server.WRITE_TIMEOUT, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(true)
        
        // Logging
        val logging = HttpLoggingInterceptor().apply {
            level = if (AppConfig.Development.ENABLE_DETAILED_LOGGING) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.BASIC
            }
        }
        builder.addInterceptor(logging)
        
        return builder.build()
    }
}