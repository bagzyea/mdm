package com.mdm.app.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import android.util.Log
import com.mdm.app.admin.MDMDeviceAdminReceiver
import com.mdm.app.models.DevicePolicy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Policy Engine for enforcing MDM policies on the device
 */
class PolicyEngine(private val context: Context) {
    
    companion object {
        private const val TAG = "PolicyEngine"
    }
    
    private val devicePolicyManager: DevicePolicyManager by lazy {
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }
    
    private val adminComponent: ComponentName by lazy {
        ComponentName(context, MDMDeviceAdminReceiver::class.java)
    }
    
    /**
     * What this app may actually do (finding F-07).
     *
     * `isDeviceAdminActive()` is retained because the UI asks it, but it must not be used
     * to gate policy calls: most of the DevicePolicyManager surface used below requires
     * Device Owner, and a Device Admin calling it either throws or silently no-ops.
     */
    fun isDeviceAdminActive(): Boolean {
        return devicePolicyManager.isAdminActive(adminComponent)
    }

    /** The privilege this app actually holds, asked of the platform. */
    fun privilegeLevel(): PrivilegeLevel = DevicePrivilege.of(context, adminComponent)

    fun isDeviceOwner(): Boolean = privilegeLevel() == PrivilegeLevel.DEVICE_OWNER
    
    /**
     * Apply a list of policies to the device
     */
    suspend fun applyPolicies(policies: List<DevicePolicy>): PolicyResult = withContext(Dispatchers.IO) {
        val results = mutableListOf<PolicyApplicationResult>()
        
        try {
            for (policy in policies) {
                val result = applyPolicy(policy)
                results.add(result)
                Log.i(TAG, "Applied policy: ${policy.name} - ${result.status}")
            }
            
            PolicyResult(
                success = results.all { it.status == PolicyStatus.SUCCESS },
                results = results,
                message = "Applied ${results.size} policies"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error applying policies", e)
            PolicyResult(
                success = false,
                results = results,
                message = "Error applying policies: ${e.message}"
            )
        }
    }
    
    /**
     * Apply a single policy to the device
     */
    private suspend fun applyPolicy(policy: DevicePolicy): PolicyApplicationResult = withContext(Dispatchers.IO) {
        try {
            when (policy.type) {
                "SECURITY" -> applySecurityPolicy(policy)
                "NETWORK" -> applyNetworkPolicy(policy)
                "APPLICATION" -> applyApplicationPolicy(policy)
                "COMPLIANCE" -> applyCompliancePolicy(policy)
                "HARDWARE" -> applyHardwarePolicy(policy)
                "SYSTEM" -> applySystemPolicy(policy)
                else -> PolicyApplicationResult(
                    policyName = policy.name,
                    status = PolicyStatus.UNSUPPORTED,
                    message = "Unsupported policy type: ${policy.type}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error applying policy: ${policy.name}", e)
            PolicyApplicationResult(
                policyName = policy.name,
                status = PolicyStatus.ERROR,
                message = "Error: ${e.message}"
            )
        }
    }
    
    /**
     * Apply security-related policies
     */
    private fun applySecurityPolicy(policy: DevicePolicy): PolicyApplicationResult {
        val outcome = PolicyOutcome(policy.name, privilegeLevel())
        val rules = policy.rules

        // The password minimum APIs are hard-deprecated for Device Admins targeting
        // API 31+ and are only honoured for a Device Owner or Profile Owner.
        if (rules.containsKey("passwordMinLength")) {
            outcome.setting("passwordMinLength", PrivilegeLevel.PROFILE_OWNER) {
                devicePolicyManager.setPasswordMinimumLength(
                    adminComponent, (rules["passwordMinLength"] as? Double)?.toInt() ?: 4
                )
            }
        }
        if (rules.containsKey("passwordRequiredLetters")) {
            outcome.setting("passwordRequiredLetters", PrivilegeLevel.PROFILE_OWNER) {
                devicePolicyManager.setPasswordMinimumLetters(
                    adminComponent, (rules["passwordRequiredLetters"] as? Double)?.toInt() ?: 0
                )
            }
        }
        if (rules.containsKey("passwordRequiredNumbers")) {
            outcome.setting("passwordRequiredNumbers", PrivilegeLevel.PROFILE_OWNER) {
                devicePolicyManager.setPasswordMinimumNumeric(
                    adminComponent, (rules["passwordRequiredNumbers"] as? Double)?.toInt() ?: 0
                )
            }
        }
        if (rules.containsKey("screenLockTimeout")) {
            outcome.setting("screenLockTimeout", PrivilegeLevel.DEVICE_ADMIN) {
                devicePolicyManager.setMaximumTimeToLock(
                    adminComponent, (rules["screenLockTimeout"] as? Double)?.toLong() ?: 30000L
                )
            }
        }
        if (rules.containsKey("cameraDisabled")) {
            outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) {
                devicePolicyManager.setCameraDisabled(
                    adminComponent, rules["cameraDisabled"] as? Boolean ?: false
                )
            }
        }
        if (rules.containsKey("requireStorageEncryption")) {
            outcome.setting("requireStorageEncryption", PrivilegeLevel.DEVICE_ADMIN) {
                if (rules["requireStorageEncryption"] as? Boolean == true) {
                    devicePolicyManager.setStorageEncryption(adminComponent, true)
                }
            }
        }
        if (rules.containsKey("passwordExpiryDays")) {
            outcome.setting("passwordExpiryDays", PrivilegeLevel.PROFILE_OWNER) {
                val days = (rules["passwordExpiryDays"] as? Double)?.toLong() ?: 0L
                devicePolicyManager.setPasswordExpirationTimeout(adminComponent, days * 24 * 60 * 60 * 1000)
            }
        }
        if (rules.containsKey("passwordHistoryCount")) {
            outcome.setting("passwordHistoryCount", PrivilegeLevel.PROFILE_OWNER) {
                devicePolicyManager.setPasswordHistoryLength(
                    adminComponent, (rules["passwordHistoryCount"] as? Double)?.toInt() ?: 0
                )
            }
        }
        if (rules.containsKey("maxFailedAttempts")) {
            outcome.setting("maxFailedAttempts", PrivilegeLevel.DEVICE_ADMIN) {
                val maxFails = (rules["maxFailedAttempts"] as? Double)?.toInt() ?: 0
                val autoWipe = rules["autoWipeOnFailure"] as? Boolean ?: false
                devicePolicyManager.setMaximumFailedPasswordsForWipe(
                    adminComponent, if (autoWipe && maxFails > 0) maxFails else 0
                )
            }
        }
        if (rules.containsKey("trustAgentsAllowed")) {
            outcome.setting("trustAgentsAllowed", PrivilegeLevel.PROFILE_OWNER) {
                val allowed = rules["trustAgentsAllowed"] as? Boolean ?: false
                devicePolicyManager.setKeyguardDisabledFeatures(
                    adminComponent,
                    if (allowed) 0 else DevicePolicyManager.KEYGUARD_DISABLE_TRUST_AGENTS
                )
            }
        }

        return outcome.result()
    }
    
    /**
     * Apply network-related policies
     */
    private fun applyNetworkPolicy(policy: DevicePolicy): PolicyApplicationResult {
        val outcome = PolicyOutcome(policy.name, privilegeLevel())
        val rules = policy.rules

        // User restrictions are Device Owner / Profile Owner only.
        restriction(outcome, rules, "nfcDisabled", UserManager.DISALLOW_OUTGOING_BEAM)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            restriction(outcome, rules, "airplaneModeDisabled", UserManager.DISALLOW_AIRPLANE_MODE)
        } else if (rules.containsKey("airplaneModeDisabled")) {
            outcome.unsupported("airplaneModeDisabled", "requires Android 9 or later")
        }

        return outcome.result()
    }

    /**
     * Apply one boolean rule as a user restriction.
     *
     * Every DISALLOW_* restriction requires Device Owner or Profile Owner; a Device Admin
     * calling addUserRestriction throws. Routing them all through here means none can be
     * attempted without the privilege, and each is reported individually.
     */
    private fun restriction(
        outcome: PolicyOutcome,
        rules: Map<String, Any?>,
        rule: String,
        restriction: String
    ) {
        if (!rules.containsKey(rule)) return

        outcome.setting(rule, PrivilegeLevel.PROFILE_OWNER) {
            if (rules[rule] as? Boolean == true) {
                devicePolicyManager.addUserRestriction(adminComponent, restriction)
            } else {
                devicePolicyManager.clearUserRestriction(adminComponent, restriction)
            }
        }
    }
    
    /**
     * Apply application-related policies
     */
    private fun applyApplicationPolicy(policy: DevicePolicy): PolicyApplicationResult {
        val outcome = PolicyOutcome(policy.name, privilegeLevel())
        val rules = policy.rules

        restriction(outcome, rules, "clipboardDlpEnabled", UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE)
        restriction(outcome, rules, "preventAppDataClearing", UserManager.DISALLOW_APPS_CONTROL)

        return outcome.result()
    }
    
    /**
     * Apply compliance-related policies
     */
    private fun applyCompliancePolicy(policy: DevicePolicy): PolicyApplicationResult {
        // Compliance rules are evaluated by the server from reported telemetry; there is
        // nothing to enforce on-device. Reported as UNSUPPORTED rather than SUCCESS so the
        // dashboard does not imply an enforcement that is not happening.
        return PolicyApplicationResult(
            policyName = policy.name,
            status = PolicyStatus.UNSUPPORTED,
            message = "Compliance policies are evaluated server-side; nothing is enforced on-device",
            settings = emptyList()
        )
    }
    
    /**
     * Apply hardware-related policies
     */
    private fun applyHardwarePolicy(policy: DevicePolicy): PolicyApplicationResult {
        val outcome = PolicyOutcome(policy.name, privilegeLevel())
        val rules = policy.rules

        if (rules.containsKey("cameraDisabled")) {
            outcome.setting("cameraDisabled", PrivilegeLevel.DEVICE_ADMIN) {
                devicePolicyManager.setCameraDisabled(
                    adminComponent, rules["cameraDisabled"] as? Boolean ?: false
                )
            }
        }

        restriction(outcome, rules, "usbFileTransferDisabled", UserManager.DISALLOW_USB_FILE_TRANSFER)
        restriction(outcome, rules, "externalStorageDisabled", UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)

        if (rules.containsKey("screenCaptureDisabled")) {
            outcome.setting("screenCaptureDisabled", PrivilegeLevel.PROFILE_OWNER) {
                devicePolicyManager.setScreenCaptureDisabled(
                    adminComponent, rules["screenCaptureDisabled"] as? Boolean ?: false
                )
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            restriction(outcome, rules, "microphoneDisabled", UserManager.DISALLOW_UNMUTE_MICROPHONE)
        } else if (rules.containsKey("microphoneDisabled")) {
            outcome.unsupported("microphoneDisabled", "requires Android 9 or later")
        }

        return outcome.result()
    }
    
    /**
     * Apply system-related policies
     */
    private fun applySystemPolicy(policy: DevicePolicy): PolicyApplicationResult {
        val outcome = PolicyOutcome(policy.name, privilegeLevel())
        val rules = policy.rules

        if (rules.containsKey("systemUpdatePolicy")) {
            val sysUpdatePolicy = when (rules["systemUpdatePolicy"] as? String) {
                "AUTOMATIC" -> android.app.admin.SystemUpdatePolicy.createAutomaticInstallPolicy()
                "POSTPONED" -> android.app.admin.SystemUpdatePolicy.createPostponeInstallPolicy()
                "WINDOWED" -> android.app.admin.SystemUpdatePolicy.createWindowedInstallPolicy(120, 300)
                else -> null
            }

            if (sysUpdatePolicy == null) {
                outcome.unsupported(
                    "systemUpdatePolicy",
                    "unrecognised value; expected AUTOMATIC, POSTPONED or WINDOWED"
                )
            } else {
                // setSystemUpdatePolicy is Device Owner only.
                outcome.setting("systemUpdatePolicy", PrivilegeLevel.DEVICE_OWNER) {
                    devicePolicyManager.setSystemUpdatePolicy(adminComponent, sysUpdatePolicy)
                }
            }
        }

        restriction(outcome, rules, "factoryResetDisabled", UserManager.DISALLOW_FACTORY_RESET)
        restriction(outcome, rules, "safeBootDisabled", UserManager.DISALLOW_SAFE_BOOT)
        restriction(outcome, rules, "timeDateModificationDisabled", UserManager.DISALLOW_CONFIG_DATE_TIME)
        restriction(outcome, rules, "accountModificationDisabled", UserManager.DISALLOW_MODIFY_ACCOUNTS)

        return outcome.result()
    }
    
    /**
     * Force device lock
     */
    fun lockDevice(): Boolean {
        return if (isDeviceAdminActive()) {
            devicePolicyManager.lockNow()
            true
        } else {
            false
        }
    }
    
    /**
     * Wipe device data
     */
    fun wipeDevice(wipeExternalStorage: Boolean = false): Boolean {
        return if (isDeviceAdminActive()) {
            val flags = if (wipeExternalStorage) {
                DevicePolicyManager.WIPE_EXTERNAL_STORAGE
            } else {
                0
            }
            devicePolicyManager.wipeData(flags)
            true
        } else {
            false
        }
    }
    
    /**
     * Reset device password
     */
    fun resetPassword(newPassword: String): Boolean {
        // resetPassword is deprecated for Device Admins targeting API 26+ and throws for
        // them; only a Device Owner or Profile Owner can still call it.
        return if (privilegeLevel().satisfies(PrivilegeLevel.PROFILE_OWNER)) {
            try {
                devicePolicyManager.resetPassword(newPassword, 0)
                true
            } catch (e: Exception) {
                Log.e(TAG, "Error resetting password", e)
                false
            }
        } else {
            false
        }
    }
    
    /**
     * Enable kiosk mode for specified packages
     */
    fun enableKioskMode(packageNames: Array<String>): Boolean {
        // setLockTaskPackages is Device Owner only. This was gated on isDeviceAdminActive(),
        // so on a Device Admin install the call was attempted, threw, was swallowed, and
        // returned false with nothing explaining why — while the census workflow depends
        // on kiosk mode.
        val held = privilegeLevel()
        if (held != PrivilegeLevel.DEVICE_OWNER) {
            Log.e(TAG, "Cannot enable kiosk mode: ${DevicePrivilege.explain(held, PrivilegeLevel.DEVICE_OWNER)}")
            return false
        }

        return try {
            devicePolicyManager.setLockTaskPackages(adminComponent, packageNames)
            Log.i(TAG, "Kiosk mode enabled for packages: ${packageNames.joinToString()}")
            true
        } catch (e: SecurityException) {
            Log.e(TAG, "Platform refused setLockTaskPackages despite device owner privilege", e)
            false
        }
    }
    
    /**
     * Disable kiosk mode
     */
    fun disableKioskMode(): Boolean {
        if (privilegeLevel() != PrivilegeLevel.DEVICE_OWNER) {
            Log.e(TAG, "Cannot disable kiosk mode: device owner privilege required")
            return false
        }
        return try {
            devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf())
            Log.i(TAG, "Kiosk mode disabled")
            true
        } catch (e: SecurityException) {
            Log.e(TAG, "Platform refused setLockTaskPackages despite device owner privilege", e)
            false
        }
    }
    
    /**
     * Start lock task mode for the given activity (single app kiosk)
     */
    fun startSingleAppKiosk(activity: android.app.Activity): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                activity.startLockTask()
                Log.i(TAG, "Single app kiosk mode started")
                true
            } else {
                Log.w(TAG, "Single app kiosk not supported on Android version < 21")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting single app kiosk", e)
            false
        }
    }
    
    /**
     * Stop lock task mode
     */
    fun stopSingleAppKiosk(activity: android.app.Activity): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                activity.stopLockTask()
                Log.i(TAG, "Single app kiosk mode stopped")
                true
            } else {
                Log.w(TAG, "Single app kiosk not supported on Android version < 21")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping single app kiosk", e)
            false
        }
    }
    
    /**
     * Check if device is currently in kiosk mode
     */
    fun isInKioskMode(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
                activityManager.lockTaskModeState != android.app.ActivityManager.LOCK_TASK_MODE_NONE
            } catch (e: Exception) {
                Log.w(TAG, "Cannot check kiosk mode status", e)
                false
            }
        } else {
            false
        }
    }
}

/**
 * Data classes for policy results
 */
data class PolicyResult(
    val success: Boolean,
    val results: List<PolicyApplicationResult>,
    val message: String
)

data class PolicyApplicationResult(
    val policyName: String,
    val status: PolicyStatus,
    val message: String,
    /** Per-setting detail, so a partially-applied policy names what did not take. */
    val settings: List<SettingOutcome> = emptyList()
)

enum class PolicyStatus {
    SUCCESS,
    ERROR,
    UNSUPPORTED,
    PENDING
}