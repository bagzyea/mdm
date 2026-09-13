package com.mdm.app.services

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mdm.app.MainActivity
import com.mdm.app.R
import com.mdm.app.utils.PreferenceManager
import com.mdm.app.websocket.CommandListener
import kotlinx.coroutines.*

/**
 * Background service for continuous MDM operations
 */
class MDMBackgroundService : Service() {
    
    companion object {
        private const val TAG = "MDMBackgroundService"
        
        const val ACTION_START_MDM = "com.mdm.app.START_MDM"
        const val ACTION_STOP_MDM = "com.mdm.app.STOP_MDM"
        
        private const val NOTIFICATION_ID = 1001
        private const val NOTIFICATION_CHANNEL_ID = "mdm_service_channel"
        private const val NOTIFICATION_CHANNEL_NAME = "MDM Background Service"

        /**
         * The running service, so a resumed Activity can lend it the few operations that
         * genuinely require one (startLockTask). Null whenever the service is not up.
         */
        @Volatile
        private var instance: MDMBackgroundService? = null

        fun commandExecutor(): CommandExecutor? = instance?.commandExecutor
    }
    
    private lateinit var mdmService: MDMService
    private lateinit var commandExecutor: CommandExecutor
    private lateinit var preferenceManager: PreferenceManager
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private var isServiceRunning = false
    
    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "MDM Background Service created")
        
        preferenceManager = PreferenceManager.getInstance(this)
        mdmService = MDMService(this)

        // Commands are executed here, in the foreground service, not in the Activity
        // (finding F-09). MainActivity used to register itself as the CommandListener, so
        // lock, kiosk and policy commands only ran while the app was on screen — which,
        // for a tablet mid-interview or asleep in a bag, is almost never.
        commandExecutor = CommandExecutor(this, mdmService, preferenceManager)
        mdmService.setCommandListener(object : CommandListener {
            override fun onServerCommand(command: org.json.JSONObject) {
                commandExecutor.handle(command)
            }
        })
        instance = this

        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "MDM Background Service start command: ${intent?.action}")
        
        when (intent?.action) {
            ACTION_START_MDM -> {
                startMDMServices()
            }
            ACTION_STOP_MDM -> {
                stopMDMServices()
                stopSelf()
            }
            else -> {
                // Default behavior - start if enrolled
                if (preferenceManager.isDeviceEnrolled()) {
                    startMDMServices()
                } else {
                    Log.w(TAG, "Device not enrolled, stopping service")
                    stopSelf()
                }
            }
        }
        
        // Return START_STICKY to restart service if killed
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        instance = null
        mdmService.setCommandListener(null)
        super.onDestroy()
        Log.i(TAG, "MDM Background Service destroyed")
        
        stopMDMServices()
        serviceScope.cancel()
    }
    
    /**
     * Start MDM services
     */
    private fun startMDMServices() {
        if (isServiceRunning) {
            Log.i(TAG, "MDM services already running")
            return
        }
        
        if (!preferenceManager.isDeviceEnrolled()) {
            Log.w(TAG, "Cannot start MDM services - device not enrolled")
            stopSelf()
            return
        }
        
        Log.i(TAG, "Starting MDM services")
        
        // Start as foreground service
        startForeground(NOTIFICATION_ID, createNotification())
        
        serviceScope.launch {
            try {
                // Start core MDM services
                mdmService.startServices()
                
                // Start background monitoring
                startBackgroundMonitoring()
                
                isServiceRunning = true
                
                Log.i(TAG, "MDM services started successfully")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start MDM services", e)
                stopSelf()
            }
        }
    }
    
    /**
     * Stop MDM services
     */
    private fun stopMDMServices() {
        if (!isServiceRunning) {
            Log.i(TAG, "MDM services not running")
            return
        }
        
        Log.i(TAG, "Stopping MDM services")
        
        serviceScope.launch {
            try {
                mdmService.stopServices()
                serviceScope.cancel()
                
                isServiceRunning = false
                
                Log.i(TAG, "MDM services stopped successfully")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping MDM services", e)
            }
        }
    }
    
    /**
     * Start background monitoring tasks
     */
    private fun startBackgroundMonitoring() {
        serviceScope.launch {
            while (isActive && isServiceRunning) {
                try {
                    // Perform periodic health checks
                    performHealthCheck()
                    
                    // Wait for next check
                    delay(5 * 60 * 1000L)
                    
                } catch (e: Exception) {
                    Log.e(TAG, "Error in background monitoring", e)
                    delay(60 * 1000L)
                }
            }
        }
    }
    
    /**
     * Perform system health check
     */
    private suspend fun performHealthCheck() {
        try {
            // Check WebSocket connection
            if (!mdmService.isWebSocketConnected()) {
                Log.w(TAG, "WebSocket disconnected, attempting reconnection")
                mdmService.startServices()
            }
            
            // Update notification with current status
            updateNotification()
            
        } catch (e: Exception) {
            Log.e(TAG, "Health check failed", e)
        }
    }
    
    /**
     * Create notification channel for Android O+
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "MDM background service notifications"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
     * Create foreground service notification
     */
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val deviceId = preferenceManager.getDeviceId()?.take(8) ?: "Unknown"
        
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("MDM Active")
            .setContentText("Device managed • ID: $deviceId")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
    
    /**
     * Update notification with current status
     */
    private fun updateNotification() {
        val notificationManager = getSystemService(NotificationManager::class.java)
        val deviceId = preferenceManager.getDeviceId()?.take(8) ?: "Unknown"
        val connectionStatus = if (mdmService.isWebSocketConnected()) "Connected" else "Connecting..."
        
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("MDM Active")
            .setContentText("$connectionStatus • ID: $deviceId")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
}