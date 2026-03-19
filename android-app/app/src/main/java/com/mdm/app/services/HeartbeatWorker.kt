package com.mdm.app.services

import android.content.Context
import android.util.Log
import androidx.work.*
import com.mdm.app.api.ApiClient
import com.mdm.app.models.DeviceStatusUpdate
import com.mdm.app.utils.DeviceInfoCollector
import com.mdm.app.utils.PreferenceManager
import com.mdm.app.websocket.WebSocketClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Background worker for reliable heartbeat and status updates
 * Uses WorkManager for guaranteed execution even when app is not active
 */
class HeartbeatWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "HeartbeatWorker"

        fun schedulePeriodicHeartbeat(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val heartbeatRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .addTag("mdm_heartbeat")
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "mdm_heartbeat_work",
                ExistingPeriodicWorkPolicy.KEEP,
                heartbeatRequest
            )
            Log.i(TAG, "Periodic heartbeat work scheduled (1 hour interval)")
        }

        fun cancelHeartbeat(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork("mdm_heartbeat_work")
            Log.i(TAG, "Periodic heartbeat work cancelled")
        }

        fun triggerImmediateHeartbeat(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val immediateRequest = OneTimeWorkRequestBuilder<HeartbeatWorker>()
                .setConstraints(constraints)
                .addTag("mdm_heartbeat_immediate")
                .build()
            WorkManager.getInstance(context).enqueue(immediateRequest)
            Log.i(TAG, "Immediate heartbeat work triggered")
        }
    }

    private val preferenceManager = PreferenceManager.getInstance(applicationContext)
    private val apiClient = ApiClient.getInstance(applicationContext)
    private val deviceInfoCollector = DeviceInfoCollector(applicationContext)
    private val webSocketClient = WebSocketClient.getInstance(applicationContext)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "Starting heartbeat work execution")

        if (!preferenceManager.isDeviceEnrolled()) {
            Log.w(TAG, "Device not enrolled, skipping heartbeat")
            return@withContext Result.success()
        }

        val deviceId = preferenceManager.getDeviceId()
        if (deviceId.isNullOrEmpty()) {
            Log.w(TAG, "Device ID not available, skipping heartbeat")
            return@withContext Result.success()
        }

        try {
            val deviceInfo = deviceInfoCollector.collectDeviceInfo(deviceId)
            val statusUpdate = DeviceStatusUpdate(
                status = "ACTIVE",
                batteryLevel = deviceInfo.batteryLevel,
                isCharging = deviceInfo.isCharging,
                location = deviceInfo.location,
                networkInfo = deviceInfo.networkInfo
            )

            var success = false

            if (webSocketClient.isConnected()) {
                try {
                    val wsPayload = mapOf(
                        "type" to "heartbeat",
                        "deviceId" to deviceId,
                        "timestamp" to System.currentTimeMillis()
                    )
                    webSocketClient.sendMessage(wsPayload)
                    success = true
                    Log.i(TAG, "Heartbeat sent via WebSocket successfully")
                } catch (e: Exception) {
                    Log.w(TAG, "WebSocket heartbeat failed, trying API", e)
                }
            }

            if (!success) {
                try {
                    val response = apiClient.mdmApiService.sendHeartbeat(deviceId, statusUpdate)
                    if (response.isSuccessful) {
                        success = true
                        Log.i(TAG, "Heartbeat sent via API successfully")
                    } else {
                        Log.w(TAG, "API heartbeat failed with code: ${response.code()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "API heartbeat failed", e)
                }
            }

            if (success) {
                preferenceManager.setLastHeartbeat(System.currentTimeMillis())
                return@withContext Result.success()
            } else {
                Log.e(TAG, "All heartbeat methods failed")
                return@withContext Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat work execution failed", e)
            return@withContext Result.retry()
        }
    }
}

/**
 * Manager class for heartbeat scheduling
 */
object HeartbeatManager {
    private const val TAG = "HeartbeatManager"

    /**
     * Start heartbeat system
     */
    fun startHeartbeat(context: Context) {
        Log.i(TAG, "Starting heartbeat system")
        HeartbeatWorker.schedulePeriodicHeartbeat(context)

        // Also trigger immediate heartbeat
        HeartbeatWorker.triggerImmediateHeartbeat(context)
    }

    /**
     * Stop heartbeat system
     */
    fun stopHeartbeat(context: Context) {
        Log.i(TAG, "Stopping heartbeat system")
        HeartbeatWorker.cancelHeartbeat(context)
    }

    /**
     * Restart heartbeat system
     */
    fun restartHeartbeat(context: Context) {
        Log.i(TAG, "Restarting heartbeat system")
        stopHeartbeat(context)
        startHeartbeat(context)
    }

    /**
     * Send immediate heartbeat
     */
    fun sendImmediateHeartbeat(context: Context) {
        Log.i(TAG, "Triggering immediate heartbeat")
        HeartbeatWorker.triggerImmediateHeartbeat(context)
    }

    /**
     * Check if heartbeat is healthy (last successful heartbeat within 2 hours)
     */
    fun isHeartbeatHealthy(context: Context): Boolean {
        val preferenceManager = PreferenceManager.getInstance(context)
        val lastHeartbeat = preferenceManager.getLastHeartbeat()
        val currentTime = System.currentTimeMillis()
        val timeSinceLastHeartbeat = currentTime - lastHeartbeat

        // Consider healthy if last heartbeat was within 2 hours
        val isHealthy = timeSinceLastHeartbeat < (2 * 60 * 60 * 1000L)

        Log.d(TAG, "Heartbeat health check: ${if (isHealthy) "HEALTHY" else "UNHEALTHY"} " +
                "(last: ${timeSinceLastHeartbeat / 1000 / 60} minutes ago)")

        return isHealthy
    }
}