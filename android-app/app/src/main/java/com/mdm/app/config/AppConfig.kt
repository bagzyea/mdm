package com.mdm.app.config

import com.mdm.app.BuildConfig
import android.content.Context
import android.content.SharedPreferences

/**
 * Application configuration constants and settings
 */
object AppConfig {
    
    // Debug flag with fallback
    private val isDebug: Boolean
        get() = try {
            BuildConfig.DEBUG
        } catch (e: Exception) {
            true
        }
    
    object Server {
        // Base API URL - HARDCODED, IMMUTABLE
        // DO NOT allow users to change this - security risk
        const val BASE_API_URL = "https://mdm.uboscare.com"  // Production
        const val BASE_API_URL_FALLBACK = "http://10.0.2.2:5001" // Emulator/Development

        // For development/emulator testing only
        const val BASE_API_URL_EMULATOR = "http://10.0.2.2:5001"

        // Certificate pinning enabled - prevents MITM attacks
        const val CERTIFICATE_PINNING_ENABLED = true

        // WebSocket endpoint
        const val WEBSOCKET_ENDPOINT = "/ws"
        
        // API endpoints
        const val ENROLLMENT_ENDPOINT = "/api/devices/enroll"
        const val HEARTBEAT_ENDPOINT = "/api/devices/heartbeat"
        const val STATUS_ENDPOINT = "/api/devices/status"
        const val COMMANDS_ENDPOINT = "/api/devices/commands"
        const val POLICIES_ENDPOINT = "/api/devices/policies"
        
        // Timeout settings
        const val CONNECTION_TIMEOUT = 30000L // 30 seconds
        const val READ_TIMEOUT = 30000L // 30 seconds
        const val WRITE_TIMEOUT = 30000L // 30 seconds
    }
    
    object Device {
        // Device identification
        const val DEVICE_ID_PREFIX = "UBOS_MDM_"
        const val DEVICE_NAME_PREFIX = "UBOS Device "
        
        // Heartbeat settings
        const val HEARTBEAT_INTERVAL = 300000L // 5 minutes
        const val HEARTBEAT_TIMEOUT = 10000L // 10 seconds
        
        // Status update settings
        const val STATUS_UPDATE_INTERVAL = 60000L // 1 minute
        const val LOCATION_UPDATE_INTERVAL = 300000L // 5 minutes
        
        // Battery monitoring
        const val BATTERY_CHECK_INTERVAL = 60000L // 1 minute
        const val LOW_BATTERY_THRESHOLD = 20 // 20%
        
        // Storage monitoring
        const val STORAGE_CHECK_INTERVAL = 300000L // 5 minutes
        const val LOW_STORAGE_THRESHOLD = 10 // 10%
    }
    
    object Security {
        // Encryption settings
        const val ENCRYPTION_ALGORITHM = "AES"
        const val KEY_SIZE = 256
        const val IV_SIZE = 16
        
        // Certificate pinning
        const val ENABLE_CERTIFICATE_PINNING = true
        const val CERTIFICATE_PINNING_TIMEOUT = 10000L // 10 seconds
        
        // Authentication
        const val TOKEN_REFRESH_INTERVAL = 3600000L // 1 hour
        const val MAX_LOGIN_ATTEMPTS = 5
        const val LOCKOUT_DURATION = 300000L // 5 minutes
    }
    
    object Logging {
        // Log levels
        const val LOG_LEVEL_VERBOSE = 0
        const val LOG_LEVEL_DEBUG = 1
        const val LOG_LEVEL_INFO = 2
        const val LOG_LEVEL_WARN = 3
        const val LOG_LEVEL_ERROR = 4
        
        // Log retention
        const val MAX_LOG_ENTRIES = 1000
        const val LOG_RETENTION_DAYS = 30
        
        // Log upload settings
        const val LOG_UPLOAD_INTERVAL = 3600000L // 1 hour
        const val LOG_UPLOAD_BATCH_SIZE = 100
    }
    
    object Network {
        // Network settings
        const val ENABLE_WIFI_ONLY = false
        const val ENABLE_CELLULAR = true
        const val ENABLE_ROAMING = false
        
        // Proxy settings
        const val USE_PROXY = false
        const val PROXY_HOST = ""
        const val PROXY_PORT = 8080
        
        // Retry settings
        const val MAX_RETRY_ATTEMPTS = 3
        const val RETRY_DELAY = 5000L // 5 seconds
        const val EXPONENTIAL_BACKOFF = true
    }
    
    object Features {
        // Feature flags
        const val ENABLE_KIOSK_MODE = true
        const val ENABLE_GEOFENCING = true
        const val ENABLE_APP_MANAGEMENT = true
        const val ENABLE_REMOTE_WIPE = true
        const val ENABLE_LOCATION_TRACKING = true
        const val ENABLE_BATTERY_MONITORING = true
        const val ENABLE_STORAGE_MONITORING = true
        const val ENABLE_NETWORK_MONITORING = true
        const val ENABLE_CRASH_REPORTING = true
        const val ENABLE_ANALYTICS = true
    }
    
    object Development {
        // Development settings
        val ALLOW_HTTP_TRAFFIC = isDebug
        val ENABLE_DEBUG_LOGGING = isDebug
        val ENABLE_CRASH_REPORTING = !isDebug
        val ENABLE_ANALYTICS = !isDebug
        val ENABLE_DETAILED_LOGGING = isDebug
        val ENABLE_PERFORMANCE_MONITORING = isDebug
    }
    
    object Preferences {
        // SharedPreferences keys
        const val PREF_NAME = "mdm_preferences"
        const val PREF_DEVICE_ID = "device_id"
        const val PREF_DEVICE_TOKEN = "device_token"
        const val PREF_SERVER_URL = "server_url"
        const val PREF_ENROLLMENT_CODE = "enrollment_code"
        const val PREF_LAST_HEARTBEAT = "last_heartbeat"
        const val PREF_LAST_SYNC = "last_sync"
        const val PREF_KIOSK_MODE_ENABLED = "kiosk_mode_enabled"
        const val PREF_GEOFENCE_ENABLED = "geofence_enabled"
        const val PREF_LOCATION_TRACKING = "location_tracking"
        const val PREF_BATTERY_MONITORING = "battery_monitoring"
        const val PREF_STORAGE_MONITORING = "storage_monitoring"
        const val PREF_NETWORK_MONITORING = "network_monitoring"
        const val PREF_CRASH_REPORTING = "crash_reporting"
        const val PREF_ANALYTICS = "analytics"
    }
}