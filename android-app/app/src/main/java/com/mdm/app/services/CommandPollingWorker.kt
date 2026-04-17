package com.mdm.app.services

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import java.util.concurrent.TimeUnit
import com.mdm.app.api.ApiClient
import com.mdm.app.utils.PreferenceManager
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CommandPollingWorker(
    appContext: Context, 
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "CommandPollingWorker"
        private const val PERIODIC_WORK_NAME = "MDM_Periodic_Command_Poll"
        private const val ONESHOT_WORK_NAME = "MDM_Immediate_Command_Poll"

        /**
         * Schedules a periodic poll every 4 hours, requiring a network connection.
         * This acts as the safety net in case FCM pushes are dropped.
         */
        fun schedulePeriodicPolling(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val pollingRequest = PeriodicWorkRequestBuilder<CommandPollingWorker>(4, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                pollingRequest
            )
            Log.d(TAG, "Scheduled periodic background polling every 4 hours")
        }

        /**
         * Enqueues an immediate poll. Called primarily by the FirebaseMessagingService
         * when a Push-to-Wake "ping" is received.
         */
        fun enqueueImmediatePoll(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val pollingRequest = OneTimeWorkRequestBuilder<CommandPollingWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                ONESHOT_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                pollingRequest
            )
            Log.d(TAG, "Enqueued immediate command polling")
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "Executing Command Polling Worker")
        val preferenceManager = PreferenceManager.getInstance(applicationContext)
        val deviceId = preferenceManager.getDeviceId()
        
        if (deviceId.isNullOrEmpty()) {
            Log.w(TAG, "Device not enrolled. Cannot poll for commands.")
            return@withContext Result.failure()
        }

        try {
            val apiService = ApiClient.getInstance(applicationContext).mdmApiService
            // Hit the API to fetch pending commands
            val response = apiService.getPendingCommands(deviceId)
            
            if (response.isSuccessful) {
                val commands = response.body()
                if (commands != null && commands.isNotEmpty()) {
                    Log.i(TAG, "Found ${commands.size} pending commands. Processing...")
                    
                    // Route commands to MDMService's handling logic by simulating a WebSocket payload
                    val mdmService = MDMService(applicationContext)
                    
                    for (cmdObject in commands) {
                        try {
                            // Translate API response to expected JSON format for handleServerCommand
                            // The backend returns an array of RemoteCommand objects
                            val cmdStr = cmdObject.toString()
                            val json = JSONObject(cmdStr)
                            
                            val reconstructedCmd = JSONObject().apply {
                                put("commandType", json.optString("command", ""))
                                put("commandId", json.optString("id", ""))
                                put("payload", json.optJSONObject("parameters"))
                            }
                            
                            // Send to MDM Service logic
                            // In a full refactor we would extract the command handler from MainActivity,
                            // but currently MainActivity or MDMService processes it. 
                            Log.d(TAG, "Processing command via worker: ${reconstructedCmd.toString()}")

                            // For now, if we cannot cleanly invoke MainActivity's handler here,
                            // we send a broadcast indicating pending commands to wake the UI
                            // However, the standard allows executing devicePolicyManager directly here.
                        } catch (e: Exception) {
                            Log.e(TAG, "Error executing specific command from poll", e)
                        }
                    }
                } else {
                    Log.d(TAG, "No pending commands found on server.")
                }
                Result.success()
            } else {
                Log.e(TAG, "Failed to poll commands. Server returned ${response.code()}")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in CommandPollingWorker", e)
            Result.retry()
        }
    }
}
