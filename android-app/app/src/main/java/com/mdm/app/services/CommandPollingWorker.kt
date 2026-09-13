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
                    
                    // Commands fetched here used to be reconstructed and then thrown
                    // away — the original comment said the handler could not be reached
                    // from a worker because it lived in MainActivity. So the periodic
                    // poll and the FCM wake both did nothing, which matters most in
                    // exactly the conditions they exist for: a tablet that has been out
                    // of coverage and is briefly back online.
                    //
                    // CommandExecutor is Activity-independent (finding F-09), so they can
                    // now actually be executed. Prefer the running service's executor so
                    // state is shared; fall back to a standalone one if the service is
                    // not up.
                    val executor = MDMBackgroundService.commandExecutor()
                        ?: CommandExecutor(
                            applicationContext,
                            MDMService(applicationContext),
                            PreferenceManager.getInstance(applicationContext)
                        )

                    for (cmdObject in commands) {
                        try {
                            val json = JSONObject(cmdObject.toString())

                            val reconstructedCmd = JSONObject().apply {
                                put("commandType", json.optString("command", ""))
                                put("commandId", json.optString("id", ""))
                                put("payload", json.optJSONObject("parameters"))
                            }

                            Log.d(TAG, "Executing polled command: ${reconstructedCmd.optString("commandType")}")
                            executor.handle(reconstructedCmd)
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
