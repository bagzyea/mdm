package com.mdm.app.services

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import com.mdm.app.admin.MDMDeviceAdminReceiver
import com.mdm.app.api.ApiClient
import com.mdm.app.models.CommandResult
import com.mdm.app.policy.DevicePrivilege
import com.mdm.app.policy.PolicyEngine
import com.mdm.app.policy.PrivilegeLevel
import com.mdm.app.utils.LocationResolver
import com.mdm.app.utils.PreferenceManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Executes server commands, independently of any Activity (finding F-09).
 *
 * Command handling lived in `MainActivity`, which registered itself as the WebSocket
 * `CommandListener`. Lock, kiosk and policy commands therefore only ran while the app was
 * foregrounded — on a tablet in a respondent's hands mid-interview, or asleep in a bag,
 * they simply did not run. For a census fleet that is most of the time, and the operator
 * saw a command that appeared to have been delivered.
 *
 * This class holds everything that does not require an Activity, and is owned by
 * [MDMBackgroundService], which is a foreground service. The few operations that genuinely
 * need a resumed Activity — `startLockTask()` and `stopLockTask()` — are delegated through
 * [ActivityActions]; when no Activity is available the command reports that honestly
 * rather than appearing to succeed.
 */
class CommandExecutor(
    private val context: Context,
    private val mdmService: MDMService,
    private val preferenceManager: PreferenceManager,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {

    /**
     * Operations that can only be performed by a resumed Activity.
     *
     * `startLockTask()` is an Activity method and the platform requires the Activity to be
     * resumed; there is no service-side equivalent.
     */
    interface ActivityActions {
        fun startLockTask(): Boolean
        fun stopLockTask(): Boolean
    }

    private val policyEngine by lazy { PolicyEngine(context) }

    private val devicePolicyManager by lazy {
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }

    private val adminComponent by lazy {
        ComponentName(context, MDMDeviceAdminReceiver::class.java)
    }

    @Volatile
    private var activityActions: ActivityActions? = null

    /** Registered by MainActivity while it is resumed; cleared when it is not. */
    fun setActivityActions(actions: ActivityActions?) {
        activityActions = actions
    }

    /** Entry point for a command arriving over the socket. */
    fun handle(command: JSONObject) {
        val commandType = command.optString("commandType")
        val commandId = command.optString("commandId")
        val payload = command.optJSONObject("payload")

        if (commandType.isEmpty() || commandId.isEmpty()) {
            Log.w(TAG, "Ignoring malformed command: $command")
            return
        }

        scope.launch {
            Log.i(TAG, "Executing $commandType ($commandId)")
            val outcome = try {
                execute(commandType, commandId, payload)
            } catch (e: Exception) {
                Log.e(TAG, "Command $commandType failed", e)
                Outcome.failure(e.message ?: e::class.java.simpleName)
            }

            // PROVISION_DEVICE and LOCATE_DEVICE report their own results.
            if (outcome.reportSeparately) return@launch

            sendResult(commandId, outcome.success, outcome.data, outcome.error)
        }
    }

    private suspend fun execute(
        commandType: String,
        commandId: String,
        payload: JSONObject?
    ): Outcome = when (commandType.uppercase()) {
        "LOCK_DEVICE" -> lockDevice()
        "UNLOCK_DEVICE" -> unlockDevice()
        "ENABLE_KIOSK", "SET_KIOSK_MODE" -> enableKiosk(payload)
        "DISABLE_KIOSK", "EXIT_KIOSK_MODE" -> disableKiosk()
        "GET_DEVICE_INFO" -> deviceInfo()
        "LOCATE_DEVICE" -> locate(commandId, payload)
        "APPLY_POLICY", "UPDATE_POLICY", "REMOVE_POLICY" -> applyPolicies()
        "SYNC_SETTINGS" -> syncSettings()
        "RESTART_SERVICES" -> restartServices()
        "PROVISION_DEVICE" -> provision(commandId, payload)
        else -> Outcome.failure("Unknown command type: $commandType")
    }

    // ---- individual commands -------------------------------------------------

    private fun lockDevice(): Outcome {
        val held = policyEngine.privilegeLevel()
        if (!held.satisfies(PrivilegeLevel.DEVICE_ADMIN)) {
            return Outcome.failure(DevicePrivilege.explain(held, PrivilegeLevel.DEVICE_ADMIN))
        }

        devicePolicyManager.lockNow()
        return Outcome.success(mapOf("locked" to true))
    }

    private fun unlockDevice(): Outcome {
        // See MainActivity's note: this previously called lockNow(), the opposite of what
        // it reported. Disabling the keyguard requires Device Owner.
        val held = policyEngine.privilegeLevel()
        if (held != PrivilegeLevel.DEVICE_OWNER) {
            return Outcome.failure(
                "UNLOCK_DEVICE " + DevicePrivilege.explain(held, PrivilegeLevel.DEVICE_OWNER)
            )
        }

        return try {
            val disabled = devicePolicyManager.setKeyguardDisabled(adminComponent, true)
            if (disabled) {
                Outcome.success(mapOf("keyguardDisabled" to true))
            } else {
                Outcome.failure("Platform refused to disable the keyguard; a secure lock screen is set")
            }
        } catch (e: SecurityException) {
            Outcome.failure("Not permitted to disable the keyguard: ${e.message}")
        }
    }

    private fun enableKiosk(payload: JSONObject?): Outcome {
        val allowed = payload?.optJSONArray("allowedPackages")?.let { array ->
            (0 until array.length()).map { array.getString(it) }.toTypedArray()
        } ?: arrayOf(context.packageName)

        if (!policyEngine.enableKioskMode(allowed)) {
            return Outcome.failure(
                "Could not set lock task packages; device owner privilege is required"
            )
        }

        preferenceManager.setKioskModeEnabled(true)
        notifyKioskState(true)

        // The allowlist is set regardless; entering lock task needs a resumed Activity.
        val actions = activityActions
        return if (actions != null && actions.startLockTask()) {
            Outcome.success(mapOf("kioskEnabled" to true, "lockTaskStarted" to true))
        } else {
            Outcome.success(
                mapOf(
                    "kioskEnabled" to true,
                    "lockTaskStarted" to false,
                    "note" to "lock task packages set; kiosk engages when the app is next foregrounded"
                )
            )
        }
    }

    private fun disableKiosk(): Outcome {
        activityActions?.stopLockTask()

        if (!policyEngine.disableKioskMode()) {
            return Outcome.failure(
                "Could not clear lock task packages; device owner privilege is required"
            )
        }

        preferenceManager.setKioskModeEnabled(false)
        notifyKioskState(false)
        return Outcome.success(mapOf("kioskEnabled" to false))
    }

    private suspend fun deviceInfo(): Outcome =
        Outcome.success(mapOf("deviceInfo" to mdmService.getDeviceInfo().toString()))

    private suspend fun locate(commandId: String, payload: JSONObject?): Outcome {
        val highAccuracy = payload?.optBoolean("enableHighAccuracy") ?: false

        try {
            val fix = LocationResolver.resolve(context, highAccuracy)
            sendResult(commandId, true, fix.toMap(), null)
        } catch (e: Exception) {
            sendResult(commandId, false, null, e.message ?: "Location unavailable")
        }

        return Outcome.reportedSeparately()
    }

    private suspend fun applyPolicies(): Outcome {
        mdmService.updatePolicies()
        return Outcome.success(mapOf("policiesRefreshed" to true))
    }

    private suspend fun syncSettings(): Outcome {
        mdmService.updatePolicies()
        return Outcome.success(mapOf("synced" to true))
    }

    private suspend fun restartServices(): Outcome {
        mdmService.stopServices()
        mdmService.startServices()
        return Outcome.success(mapOf("restarted" to true))
    }

    private suspend fun provision(commandId: String, payload: JSONObject?): Outcome {
        if (payload == null) {
            return Outcome.failure("PROVISION_DEVICE requires a payload")
        }

        DeviceProvisioningExecutor(context, mdmService, preferenceManager)
            .executeProvisioning(payload, commandId)

        // The executor reports its own progress and final result.
        return Outcome.reportedSeparately()
    }

    // ---- reporting -----------------------------------------------------------

    private fun notifyKioskState(enabled: Boolean) {
        if (!mdmService.isWebSocketConnected()) return

        mdmService.sendTestMessage(
            mapOf(
                "type" to "kiosk_mode_changed",
                "deviceId" to preferenceManager.getDeviceId(),
                "enabled" to enabled,
                "timestamp" to System.currentTimeMillis()
            )
        )
    }

    private suspend fun sendResult(commandId: String, success: Boolean, data: Any?, error: String?) {
        if (!mdmService.isWebSocketConnected()) {
            // Commands collected by the HTTP poll run exactly when there is no socket, so
            // their results used to be dropped here. Report them over HTTP instead.
            sendResultOverHttp(commandId, success, data, error)
            return
        }

        mdmService.sendTestMessage(
            mapOf(
                "type" to "command_result",
                "deviceId" to preferenceManager.getDeviceId(),
                "commandId" to commandId,
                "success" to success,
                "result" to data,
                "error" to error,
                "timestamp" to System.currentTimeMillis()
            )
        )
    }

    private suspend fun sendResultOverHttp(commandId: String, success: Boolean, data: Any?, error: String?) {
        val result: Map<String, Any>? = when (data) {
            null -> null
            is Map<*, *> -> data.entries
                .filter { it.key is String && it.value != null }
                .associate { it.key as String to it.value!! }
            else -> mapOf("value" to data)
        }

        try {
            val response = ApiClient.getInstance(context).mdmApiService.sendCommandResult(
                commandId,
                CommandResult(
                    commandId = commandId,
                    deviceId = preferenceManager.getDeviceId(),
                    status = if (success) "SUCCESS" else "ERROR",
                    result = result,
                    error = error
                )
            )
            if (!response.isSuccessful) {
                Log.w(TAG, "Server refused result for $commandId: HTTP ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Could not report result for $commandId", e)
        }
    }

    /** The result of executing one command. */
    data class Outcome(
        val success: Boolean,
        val data: Any? = null,
        val error: String? = null,
        /** True when the command already sent its own result and must not send another. */
        val reportSeparately: Boolean = false
    ) {
        companion object {
            fun success(data: Any? = null) = Outcome(success = true, data = data)
            fun failure(error: String) = Outcome(success = false, error = error)
            fun reportedSeparately() = Outcome(success = true, reportSeparately = true)
        }
    }

    private companion object {
        const val TAG = "CommandExecutor"
    }
}
