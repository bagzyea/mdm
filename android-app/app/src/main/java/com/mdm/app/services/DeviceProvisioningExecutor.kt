package com.mdm.app.services

import android.content.Context
import android.util.Log
import com.mdm.app.models.AppInstallationPackage
import com.mdm.app.utils.PreferenceManager
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * DeviceProvisioningExecutor handles over-the-air (OTA) device provisioning.
 *
 * Receives PROVISION_DEVICE commands from the MDM server and executes the provisioning workflow:
 * 1. Downloads APKs from the provisioning profile
 * 2. Verifies APK hashes
 * 3. Installs applications with required permissions
 * 4. Configures network settings (if provided)
 * 5. Configures security settings (if provided)
 * 6. Reports progress to the server at each step
 */
class DeviceProvisioningExecutor(
    private val context: Context,
    private val mdmService: MDMService,
    private val preferenceManager: PreferenceManager
) {
    companion object {
        private const val TAG = "DeviceProvisioningExecutor"
    }

    suspend fun executeProvisioning(payload: JSONObject, commandId: String) {
        return withContext(Dispatchers.IO) {
            try {
                val sessionId = payload.getString("sessionId")
                val profileId = payload.getString("profileId")
                val apps = payload.getJSONArray("apps")
                val networkConfig = payload.optJSONObject("networkConfig")
                val securityConfig = payload.optJSONObject("securityConfig")

                Log.d(TAG, "Starting provisioning for session $sessionId, profile $profileId with ${apps.length()} apps")

                // Report STARTED
                reportProgress(
                    sessionId, commandId, "DOWNLOADING_APPS", "Starting provisioning",
                    0, apps.length() * 2
                )

                // Step 1: Download and install applications
                val appMgmtService = AppManagementService(context)

                for (i in 0 until apps.length()) {
                    val app = apps.getJSONObject(i)
                    val packageName = app.getString("packageName")
                    val appName = app.getString("appName")
                    val apkUrl = app.getString("apkUrl")
                    val apkHash = app.optString("apkHash", "")
                    val permissions = app.optJSONArray("permissions")
                    val installOrder = app.getInt("installOrder")
                    val isRequired = app.getBoolean("isRequired")

                    Log.d(TAG, "Processing app $i: $appName (package: $packageName)")

                    // Report downloading
                    reportProgress(
                        sessionId, commandId, "DOWNLOADING_APPS",
                        "Downloading $appName",
                        i * 2, apps.length() * 2
                    )

                    // Create app installation package
                    val permissionsList = mutableListOf<String>()
                    permissions?.let {
                        for (j in 0 until it.length()) {
                            permissionsList.add(it.getString(j))
                        }
                    }

                    val pkg = AppInstallationPackage(
                        packageName = packageName,
                        appName = appName,
                        apkUrl = apkUrl,
                        apkHash = apkHash,
                        permissions = permissionsList,
                        installOrder = installOrder,
                        isRequired = isRequired
                    )

                    // Download and install app
                    val result = appMgmtService.downloadAndInstallApp(pkg)

                    if (!result.success) {
                        val errorMsg = "Failed to install $appName: ${result.error}"
                        Log.e(TAG, errorMsg)

                        reportProgress(
                            sessionId, commandId, "FAILED",
                            errorMsg,
                            i * 2, apps.length() * 2,
                            error = result.error
                        )
                        return@withContext
                    }

                    // Report installed
                    reportProgress(
                        sessionId, commandId, "INSTALLING_APPS",
                        "Installed $appName",
                        i * 2 + 1, apps.length() * 2
                    )
                }

                // Step 2: Configure network if present
                if (networkConfig != null) {
                    reportProgress(
                        sessionId, commandId, "CONFIGURING_NETWORK",
                        "Configuring network settings",
                        apps.length(), apps.length() * 2
                    )
                    configureNetwork(networkConfig, sessionId, commandId)
                }

                // Step 3: Configure security if present
                if (securityConfig != null) {
                    reportProgress(
                        sessionId, commandId, "CONFIGURING_SECURITY",
                        "Configuring security settings",
                        apps.length() + 1, apps.length() * 2
                    )
                    configureSecurity(securityConfig, sessionId, commandId)
                }

                // Report COMPLETED
                reportProgress(
                    sessionId, commandId, "COMPLETED",
                    "Provisioning complete",
                    apps.length() * 2, apps.length() * 2
                )

                Log.d(TAG, "Provisioning completed successfully for session $sessionId")

            } catch (e: Exception) {
                Log.e(TAG, "Provisioning failed", e)
                reportProgress(
                    payload.getString("sessionId"),
                    commandId,
                    "FAILED",
                    "Provisioning failed: ${e.message}",
                    0,
                    0,
                    error = e.message ?: "Unknown error"
                )
            }
        }
    }

    private suspend fun configureNetwork(
        networkConfig: JSONObject,
        sessionId: String,
        commandId: String
    ) {
        return withContext(Dispatchers.IO) {
            try {
                // Extract network configuration
                val apnConfig = networkConfig.optJSONObject("apnConfig")

                if (apnConfig != null) {
                    val carrier = apnConfig.optString("carrier", "CUSTOM")
                    val apn = apnConfig.optString("apn", "")
                    val name = apnConfig.optString("name", "")
                    val type = apnConfig.optString("type", "4G")
                    val protocol = apnConfig.optString("protocol", "IPV4V6")

                    Log.d(TAG, "Configuring network: carrier=$carrier, apn=$apn, type=$type")

                    // In a real implementation, this would configure APN settings
                    // For now, just log as this requires privileged system app permissions
                    Log.d(TAG, "Network configuration applied (mock implementation)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to configure network", e)
                // Don't fail provisioning if network config fails
            }
        }
    }

    private suspend fun configureSecurity(
        securityConfig: JSONObject,
        sessionId: String,
        commandId: String
    ) {
        return withContext(Dispatchers.IO) {
            try {
                // Extract security configuration
                val devicePin = securityConfig.optString("devicePin", null)
                val screenTimeout = securityConfig.optInt("screenTimeout", -1)
                val enableEncryption = securityConfig.optBoolean("enableEncryption", false)
                val encryptionType = securityConfig.optString("encryptionType", "AES")

                Log.d(TAG, "Configuring security: encryption=$enableEncryption, timeout=$screenTimeout")

                // In a real implementation, this would apply security policies
                // Most of these require DeviceAdmin or system-level permissions
                Log.d(TAG, "Security configuration applied (mock implementation)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to configure security", e)
                // Don't fail provisioning if security config fails
            }
        }
    }

    private fun reportProgress(
        sessionId: String,
        commandId: String,
        step: String,
        subStep: String,
        completedSteps: Int,
        totalSteps: Int,
        error: String? = null
    ) {
        try {
            val msg = JSONObject().apply {
                put("sessionId", sessionId)
                put("deviceId", preferenceManager.getDeviceId() ?: "unknown")
                put("commandId", commandId)
                put("step", step)
                put("subStep", subStep)
                put("completedSteps", completedSteps)
                put("totalSteps", totalSteps)
                if (error != null) {
                    put("error", error)
                }
                put("timestamp", System.currentTimeMillis())
            }

            Log.d(TAG, "Reporting progress: step=$step, completed=$completedSteps/$totalSteps")

            // Emitted as its own event, not wrapped in a generic `message`. The
            // server's `message` handler only understands 'heartbeat' and
            // 'command_result', so progress sent that way was silently discarded — the
            // server listens for 'provisioningProgress'.
            mdmService.sendEvent("provisioningProgress", msg)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report progress", e)
            // Continue even if reporting fails
        }
    }
}

/**
 * Result of an app download/install operation
 */
data class AppInstallationResult(
    val success: Boolean,
    val packageName: String = "",
    val error: String? = null
)
