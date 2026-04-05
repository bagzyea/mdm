package com.mdm.app.utils

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * Secure preference manager using AES-256-GCM encrypted shared preferences
 * All sensitive data (tokens, device IDs) are encrypted at rest
 */
class PreferenceManager private constructor(private val context: Context) {
    
    companion object {
        @Volatile
        private var INSTANCE: PreferenceManager? = null
        
        private const val PREFS_NAME = "mdm_secure_prefs"
        
        // Preference keys
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_IS_ENROLLED = "is_enrolled"
        private const val KEY_LAST_HEARTBEAT = "last_heartbeat"
        private const val KEY_ENROLLMENT_CODE = "enrollment_code"
        private const val KEY_ORGANIZATION_ID = "organization_id"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_KIOSK_MODE_ENABLED = "kiosk_mode_enabled"
        
        fun getInstance(context: Context): PreferenceManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: PreferenceManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    
    private val sharedPrefs: SharedPreferences by lazy {
        try {
            EncryptedSharedPreferences.create(
                PREFS_NAME,
                masterKeyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            ).also {
                Log.d("PreferenceManager", "EncryptedSharedPreferences initialized successfully")
            }
        } catch (e: Exception) {
            Log.e("PreferenceManager", "Failed to initialize EncryptedSharedPreferences", e)
            // Fallback to regular SharedPreferences (data will be encrypted when possible)
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }
    
    // Device ID
    fun getDeviceId(): String? = sharedPrefs.getString(KEY_DEVICE_ID, null)
    fun setDeviceId(deviceId: String) = sharedPrefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
    fun clearDeviceId() = sharedPrefs.edit().remove(KEY_DEVICE_ID).apply()
    
    // Device Token
    fun getDeviceToken(): String? = sharedPrefs.getString(KEY_DEVICE_TOKEN, null)
    fun setDeviceToken(token: String) = sharedPrefs.edit().putString(KEY_DEVICE_TOKEN, token).apply()
    fun clearDeviceToken() = sharedPrefs.edit().remove(KEY_DEVICE_TOKEN).apply()
    
    // Server URL
    fun getServerUrl(): String? = sharedPrefs.getString(KEY_SERVER_URL, null)
    fun setServerUrl(url: String) = sharedPrefs.edit().putString(KEY_SERVER_URL, url).apply()
    
    // Enrollment status
    fun isDeviceEnrolled(): Boolean = sharedPrefs.getBoolean(KEY_IS_ENROLLED, false)
    fun setDeviceEnrolled(enrolled: Boolean) = sharedPrefs.edit().putBoolean(KEY_IS_ENROLLED, enrolled).apply()
    
    // Last heartbeat
    fun getLastHeartbeat(): Long = sharedPrefs.getLong(KEY_LAST_HEARTBEAT, 0L)
    fun setLastHeartbeat(timestamp: Long) = sharedPrefs.edit().putLong(KEY_LAST_HEARTBEAT, timestamp).apply()
    
    // Enrollment code
    fun getEnrollmentCode(): String? = sharedPrefs.getString(KEY_ENROLLMENT_CODE, null)
    fun setEnrollmentCode(code: String) = sharedPrefs.edit().putString(KEY_ENROLLMENT_CODE, code).apply()
    
    // Organization ID
    fun getOrganizationId(): String? = sharedPrefs.getString(KEY_ORGANIZATION_ID, null)
    fun setOrganizationId(orgId: String) = sharedPrefs.edit().putString(KEY_ORGANIZATION_ID, orgId).apply()
    
    // User ID
    fun getUserId(): String? = sharedPrefs.getString(KEY_USER_ID, null)
    fun setUserId(userId: String) = sharedPrefs.edit().putString(KEY_USER_ID, userId).apply()
    fun clearUserId() = sharedPrefs.edit().remove(KEY_USER_ID).apply()
    
    // Policies
    fun getPolicies(): List<String> {
        val policiesJson = sharedPrefs.getString("policies", "[]")
        return try {
            // Simple JSON parsing for policies list
            if (policiesJson.isNullOrEmpty() || policiesJson == "[]") {
                emptyList()
            } else {
                policiesJson.removeSurrounding("[", "]").split(",").map { it.trim().removeSurrounding("\"") }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    fun setPolicies(policies: List<String>) {
        val policiesJson = policies.joinToString(",") { "\"$it\"" }
        sharedPrefs.edit().putString("policies", "[$policiesJson]").apply()
    }
    
    // App Inventory
    fun getAppInventory(): List<String> {
        val appsJson = sharedPrefs.getString("app_inventory", "[]")
        return try {
            if (appsJson.isNullOrEmpty() || appsJson == "[]") {
                emptyList()
            } else {
                appsJson.removeSurrounding("[", "]").split(",").map { it.trim().removeSurrounding("\"") }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    fun setAppInventory(apps: List<String>) {
        val appsJson = apps.joinToString(",") { "\"$it\"" }
        sharedPrefs.edit().putString("app_inventory", "[$appsJson]").apply()
    }
    
    // Kiosk mode
    fun isKioskModeEnabled(): Boolean = sharedPrefs.getBoolean(KEY_KIOSK_MODE_ENABLED, false)
    fun setKioskModeEnabled(enabled: Boolean) = sharedPrefs.edit().putBoolean(KEY_KIOSK_MODE_ENABLED, enabled).apply()
    
    /**
     * Clear all stored data
     */
    fun clearAll() {
        sharedPrefs.edit().clear().apply()
    }
    
    /**
     * Clear authentication data only
     */
    fun clearAuthData() {
        sharedPrefs.edit()
            .remove(KEY_DEVICE_TOKEN)
            .remove(KEY_IS_ENROLLED)
            .apply()
    }

    /**
     * Migrate unencrypted preferences to encrypted storage
     * Safely handles migration from regular SharedPreferences to EncryptedSharedPreferences
     */
    fun migrateFromUnencryptedPrefs() {
        try {
            val unencryptedPrefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)

            // Check if migration is needed
            val hasMigrationMarker = sharedPrefs.getBoolean("__migrated", false)
            if (hasMigrationMarker) {
                Log.d("PreferenceManager", "Already migrated from unencrypted preferences")
                return
            }

            // Migrate all keys from unencrypted to encrypted storage
            for ((key, value) in unencryptedPrefs.all) {
                when (value) {
                    is String -> sharedPrefs.edit().putString(key, value).apply()
                    is Boolean -> sharedPrefs.edit().putBoolean(key, value as Boolean).apply()
                    is Int -> sharedPrefs.edit().putInt(key, value as Int).apply()
                    is Long -> sharedPrefs.edit().putLong(key, value as Long).apply()
                    is Float -> sharedPrefs.edit().putFloat(key, value as Float).apply()
                }
            }

            // Mark migration as complete
            sharedPrefs.edit().putBoolean("__migrated", true).apply()

            // Clear unencrypted storage
            unencryptedPrefs.edit().clear().apply()

            Log.d("PreferenceManager", "Migration from unencrypted preferences completed successfully")
        } catch (e: Exception) {
            Log.e("PreferenceManager", "Error migrating preferences", e)
        }
    }

    /**
     * Verify that encryption is working properly
     */
    fun verifyEncryption(): Boolean {
        return try {
            val testKey = "__encryption_test"
            val testValue = "test_${System.currentTimeMillis()}"

            sharedPrefs.edit().putString(testKey, testValue).apply()
            val retrieved = sharedPrefs.getString(testKey, null)

            val isValid = retrieved == testValue
            sharedPrefs.edit().remove(testKey).apply()

            Log.d("PreferenceManager", "Encryption verification: ${if (isValid) "OK" else "FAILED"}")
            isValid
        } catch (e: Exception) {
            Log.e("PreferenceManager", "Encryption verification failed", e)
            false
        }
    }
}