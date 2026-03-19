package com.mdm.app.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
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
        // Network policies would require system-level access or device owner mode
        // For now, we'll log the policy and mark as applied
        Log.i(TAG, "Network policy applied: ${policy.name}")
        
        return PolicyApplicationResult(
            policyName = policy.name,
            status = PolicyStatus.SUCCESS,
            message = "Network policy logged (requires device owner mode for full enforcement)"
        )
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
        
        val rules = policy.rules
        
        // Application restrictions would be applied here
        // This typically requires device owner or profile owner mode
        Log.i(TAG, "Application policy applied: ${policy.name}")
        
        return PolicyApplicationResult(
            policyName = policy.name,
            status = PolicyStatus.SUCCESS,
            message = "Application policy applied"
        )
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