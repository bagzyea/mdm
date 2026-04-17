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
     * Check if device admin is active
     */
    fun isDeviceAdminActive(): Boolean {
        return devicePolicyManager.isAdminActive(adminComponent)
    }
    
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
        if (!isDeviceAdminActive()) {
            return PolicyApplicationResult(
                policyName = policy.name,
                status = PolicyStatus.ERROR,
                message = "Device admin not active"
            )
        }
        
        return try {
            val rules = policy.rules
            
            // Password policies
            if (rules.containsKey("passwordMinLength")) {
                val minLength = (rules["passwordMinLength"] as? Double)?.toInt() ?: 4
                devicePolicyManager.setPasswordMinimumLength(adminComponent, minLength)
            }
            
            if (rules.containsKey("passwordRequiredLetters")) {
                val requiredLetters = (rules["passwordRequiredLetters"] as? Double)?.toInt() ?: 0
                devicePolicyManager.setPasswordMinimumLetters(adminComponent, requiredLetters)
            }
            
            if (rules.containsKey("passwordRequiredNumbers")) {
                val requiredNumbers = (rules["passwordRequiredNumbers"] as? Double)?.toInt() ?: 0
                devicePolicyManager.setPasswordMinimumNumeric(adminComponent, requiredNumbers)
            }
            
            // Screen lock timeout
            if (rules.containsKey("screenLockTimeout")) {
                val timeout = (rules["screenLockTimeout"] as? Double)?.toLong() ?: 30000L
                devicePolicyManager.setMaximumTimeToLock(adminComponent, timeout)
            }
            
            // Camera disabled
            if (rules.containsKey("cameraDisabled")) {
                val disabled = rules["cameraDisabled"] as? Boolean ?: false
                devicePolicyManager.setCameraDisabled(adminComponent, disabled)
            }
            
            // Storage encryption
            if (rules.containsKey("requireStorageEncryption")) {
                val required = rules["requireStorageEncryption"] as? Boolean ?: false
                if (required) {
                    devicePolicyManager.setStorageEncryption(adminComponent, true)
                }
            }
            
            // Password Expiry
            if (rules.containsKey("passwordExpiryDays")) {
                val days = (rules["passwordExpiryDays"] as? Double)?.toLong() ?: 0L
                val ms = days * 24 * 60 * 60 * 1000
                devicePolicyManager.setPasswordExpirationTimeout(adminComponent, ms)
            }
            
            // Password History
            if (rules.containsKey("passwordHistoryCount")) {
                val count = (rules["passwordHistoryCount"] as? Double)?.toInt() ?: 0
                devicePolicyManager.setPasswordHistoryLength(adminComponent, count)
            }
            
            // Password failures leading to wipe
            if (rules.containsKey("maxFailedAttempts")) {
                val maxFails = (rules["maxFailedAttempts"] as? Double)?.toInt() ?: 0
                val autoWipe = rules["autoWipeOnFailure"] as? Boolean ?: false
                
                if (autoWipe && maxFails > 0) {
                    devicePolicyManager.setMaximumFailedPasswordsForWipe(adminComponent, maxFails)
                } else if (!autoWipe) {
                    devicePolicyManager.setMaximumFailedPasswordsForWipe(adminComponent, 0)
                }
            }
            
            // Trust agents (Smart Lock)
            if (rules.containsKey("trustAgentsAllowed") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val allowed = rules["trustAgentsAllowed"] as? Boolean ?: false
                if (!allowed) {
                    devicePolicyManager.setKeyguardDisabledFeatures(adminComponent, DevicePolicyManager.KEYGUARD_DISABLE_TRUST_AGENTS)
                } else {
                    devicePolicyManager.setKeyguardDisabledFeatures(adminComponent, 0)
                }
            }
            
            PolicyApplicationResult(
                policyName = policy.name,
                status = PolicyStatus.SUCCESS,
                message = "Security policy applied successfully"
            )
            
        } catch (e: SecurityException) {
            PolicyApplicationResult(
                policyName = policy.name,
                status = PolicyStatus.ERROR,
                message = "Security exception: ${e.message}"
            )
        }
    }
    
    /**
     * Apply network-related policies
     */
    private fun applyNetworkPolicy(policy: DevicePolicy): PolicyApplicationResult {
        if (!isDeviceAdminActive()) {
            return PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Device admin not active")
        }
        
        return try {
            val rules = policy.rules
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                if (rules.containsKey("nfcDisabled")) {
                    val disabled = rules["nfcDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_OUTGOING_BEAM)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_OUTGOING_BEAM)
                    }
                }
                
                if (rules.containsKey("airplaneModeDisabled") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    val disabled = rules["airplaneModeDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_AIRPLANE_MODE)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_AIRPLANE_MODE)
                    }
                }
            }
            
            Log.i(TAG, "Network policy applied: ${policy.name}")
            PolicyApplicationResult(policy.name, PolicyStatus.SUCCESS, "Network policy applied")
        } catch (e: Exception) {
            PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Network exception: ${e.message}")
        }
    }
    
    /**
     * Apply application-related policies
     */
    private fun applyApplicationPolicy(policy: DevicePolicy): PolicyApplicationResult {
        if (!isDeviceAdminActive()) {
            return PolicyApplicationResult(
                policyName = policy.name,
                status = PolicyStatus.ERROR,
                message = "Device admin not active"
            )
        }
        
        return try {
            val rules = policy.rules
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                if (rules.containsKey("clipboardDlpEnabled")) {
                    val enabled = rules["clipboardDlpEnabled"] as? Boolean ?: false
                    if (enabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_CROSS_PROFILE_COPY_PASTE)
                    }
                }
                
                if (rules.containsKey("preventAppDataClearing")) {
                    val prevent = rules["preventAppDataClearing"] as? Boolean ?: false
                    if (prevent) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_APPS_CONTROL)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_APPS_CONTROL)
                    }
                }
            }
            
            Log.i(TAG, "Application policy applied: ${policy.name}")
            PolicyApplicationResult(policy.name, PolicyStatus.SUCCESS, "Application policy applied")
        } catch (e: Exception) {
            PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Application exception: ${e.message}")
        }
    }
    
    /**
     * Apply compliance-related policies
     */
    private fun applyCompliancePolicy(policy: DevicePolicy): PolicyApplicationResult {
        // Compliance policies are typically enforced through monitoring
        Log.i(TAG, "Compliance policy applied: ${policy.name}")
        
        return PolicyApplicationResult(
            policyName = policy.name,
            status = PolicyStatus.SUCCESS,
            message = "Compliance policy applied"
        )
    }
    
    /**
     * Apply hardware-related policies
     */
    private fun applyHardwarePolicy(policy: DevicePolicy): PolicyApplicationResult {
        if (!isDeviceAdminActive()) {
            return PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Device admin not active")
        }
        
        return try {
            val rules = policy.rules
            
            // Camera
            if (rules.containsKey("cameraDisabled")) {
                val disabled = rules["cameraDisabled"] as? Boolean ?: false
                devicePolicyManager.setCameraDisabled(adminComponent, disabled)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // USB File Transfer (requires Device Owner)
                if (rules.containsKey("usbFileTransferDisabled")) {
                    val disabled = rules["usbFileTransferDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
                    }
                }
                
                // External Storage
                if (rules.containsKey("externalStorageDisabled")) {
                    val disabled = rules["externalStorageDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
                    }
                }
                
                // Screen Capture
                if (rules.containsKey("screenCaptureDisabled")) {
                    val disabled = rules["screenCaptureDisabled"] as? Boolean ?: false
                    devicePolicyManager.setScreenCaptureDisabled(adminComponent, disabled)
                }
            }
            
            // Microphone
            if (rules.containsKey("microphoneDisabled")) {
                val disabled = rules["microphoneDisabled"] as? Boolean ?: false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_UNMUTE_MICROPHONE)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_UNMUTE_MICROPHONE)
                    }
                }
            }
            
            PolicyApplicationResult(policy.name, PolicyStatus.SUCCESS, "Hardware policy applied")
        } catch (e: SecurityException) {
            PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Hardware exception: ${e.message} (May require Device Owner)")
        } catch (e: Exception) {
            PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Hardware exception: ${e.message}")
        }
    }
    
    /**
     * Apply system-related policies
     */
    private fun applySystemPolicy(policy: DevicePolicy): PolicyApplicationResult {
        if (!isDeviceAdminActive()) {
            return PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "Device admin not active")
        }
        
        return try {
            val rules = policy.rules
            
            // System updates
            if (rules.containsKey("systemUpdatePolicy") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val updatePolicyStr = rules["systemUpdatePolicy"] as? String
                val sysUpdatePolicy = when (updatePolicyStr) {
                    "AUTOMATIC" -> android.app.admin.SystemUpdatePolicy.createAutomaticInstallPolicy()
                    "POSTPONED" -> android.app.admin.SystemUpdatePolicy.createPostponeInstallPolicy()
                    "WINDOWED" -> {
                        // Assuming format "02:00" might be used, but we just use a default window for now
                        // Time logic requires parsing of string. For simplicity:
                        android.app.admin.SystemUpdatePolicy.createWindowedInstallPolicy(120, 300) // 2am to 5am
                    }
                    else -> null
                }
                
                if (sysUpdatePolicy != null) {
                    devicePolicyManager.setSystemUpdatePolicy(adminComponent, sysUpdatePolicy)
                }
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // Factory Reset Disabled
                if (rules.containsKey("factoryResetDisabled")) {
                    val disabled = rules["factoryResetDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
                    }
                }
                
                // Safe Boot Disabled
                if (rules.containsKey("safeBootDisabled")) {
                    val disabled = rules["safeBootDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
                    }
                }
                
                // Time/Date modification
                if (rules.containsKey("timeDateModificationDisabled")) {
                    val disabled = rules["timeDateModificationDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_DATE_TIME)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_DATE_TIME)
                    }
                }
                
                // Account Modification (Prevents FRP)
                if (rules.containsKey("accountModificationDisabled")) {
                    val disabled = rules["accountModificationDisabled"] as? Boolean ?: false
                    if (disabled) {
                        devicePolicyManager.addUserRestriction(adminComponent, UserManager.DISALLOW_MODIFY_ACCOUNTS)
                    } else {
                        devicePolicyManager.clearUserRestriction(adminComponent, UserManager.DISALLOW_MODIFY_ACCOUNTS)
                    }
                }
            }
            
            PolicyApplicationResult(policy.name, PolicyStatus.SUCCESS, "System policy applied")
        } catch (e: SecurityException) {
            PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "System exception: ${e.message} (May require Device Owner)")
        } catch (e: Exception) {
            PolicyApplicationResult(policy.name, PolicyStatus.ERROR, "System exception: ${e.message}")
        }
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
        return if (isDeviceAdminActive()) {
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
        return if (isDeviceAdminActive()) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    devicePolicyManager.setLockTaskPackages(adminComponent, packageNames)
                    Log.i(TAG, "Kiosk mode enabled for packages: ${packageNames.joinToString()}")
                    true
                } else {
                    Log.w(TAG, "Kiosk mode not supported on Android version < 21")
                    false
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "Security exception enabling kiosk mode", e)
                false
            }
        } else {
            Log.e(TAG, "Cannot enable kiosk mode - device admin not active")
            false
        }
    }
    
    /**
     * Disable kiosk mode
     */
    fun disableKioskMode(): Boolean {
        return if (isDeviceAdminActive()) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf())
                    Log.i(TAG, "Kiosk mode disabled")
                    true
                } else {
                    Log.w(TAG, "Kiosk mode not supported on Android version < 21")
                    false
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "Security exception disabling kiosk mode", e)
                false
            }
        } else {
            Log.e(TAG, "Cannot disable kiosk mode - device admin not active")
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
    val message: String
)

enum class PolicyStatus {
    SUCCESS,
    ERROR,
    UNSUPPORTED,
    PENDING
}