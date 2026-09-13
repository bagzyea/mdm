package com.mdm.app.models

import com.google.gson.annotations.SerializedName

/**
 * Remote command received from server
 */
data class RemoteCommand(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("command")
    val command: String,
    
    @SerializedName("parameters")
    val parameters: Map<String, Any>? = null,
    
    @SerializedName("deviceId")
    val deviceId: String? = null,
    
    @SerializedName("priority")
    val priority: CommandPriority = CommandPriority.NORMAL,
    
    @SerializedName("timeout")
    val timeout: Long = 30000L, // 30 seconds default
    
    @SerializedName("createdAt")
    val createdAt: String,
    
    @SerializedName("updatedAt")
    val updatedAt: String,
    
    @SerializedName("expiresAt")
    val expiresAt: String? = null
)

/**
 * Result of command execution
 */
data class CommandResult(
    @SerializedName("commandId")
    val commandId: String,
    
    @SerializedName("deviceId")
    val deviceId: String? = null,
    
    @SerializedName("status")
    val status: String, // SUCCESS, ERROR, TIMEOUT, CANCELLED
    
    @SerializedName("result")
    val result: Map<String, Any>? = null,
    
    @SerializedName("error")
    val error: String? = null,
    
    @SerializedName("executionTime")
    val executionTime: Long = System.currentTimeMillis(),
    
    @SerializedName("duration")
    val duration: Long? = null // Execution duration in milliseconds
)

/**
 * Device status update sent to server
 */
data class DeviceStatusUpdate(
    @SerializedName("deviceId")
    val deviceId: String? = null,
    
    @SerializedName("status")
    val status: String, // ONLINE, OFFLINE, ACTIVE, INACTIVE, ERROR
    
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis(),
    
    @SerializedName("batteryLevel")
    val batteryLevel: Int? = null,
    
    @SerializedName("isCharging")
    val isCharging: Boolean? = null,
    
    @SerializedName("location")
    val location: DeviceLocation? = null,
    
    @SerializedName("networkInfo")
    val networkInfo: NetworkInfo? = null,
    
    @SerializedName("memoryUsage")
    val memoryUsage: MemoryUsage? = null,
    
    @SerializedName("storageUsage")
    val storageUsage: StorageUsage? = null,
    
    @SerializedName("activeApps")
    val activeApps: List<String>? = null,
    
    @SerializedName("policyCompliance")
    val policyCompliance: PolicyComplianceStatus? = null
)

/**
 * Memory usage information
 */
data class MemoryUsage(
    @SerializedName("totalRAM")
    val totalRAM: Long,
    
    @SerializedName("usedRAM")
    val usedRAM: Long,
    
    @SerializedName("availableRAM")
    val availableRAM: Long
)

/**
 * Storage usage information
 */
data class StorageUsage(
    @SerializedName("totalStorage")
    val totalStorage: Long,
    
    @SerializedName("usedStorage")
    val usedStorage: Long,
    
    @SerializedName("availableStorage")
    val availableStorage: Long
)

/**
 * Policy compliance status
 */
data class PolicyComplianceStatus(
    @SerializedName("isCompliant")
    val isCompliant: Boolean,
    
    @SerializedName("violations")
    val violations: List<PolicyViolation>? = null,
    
    @SerializedName("lastChecked")
    val lastChecked: Long = System.currentTimeMillis()
)

/**
 * Policy violation details
 */
data class PolicyViolation(
    @SerializedName("policyName")
    val policyName: String,
    
    @SerializedName("violationType")
    val violationType: String,
    
    @SerializedName("description")
    val description: String,
    
    @SerializedName("severity")
    val severity: ViolationSeverity,
    
    @SerializedName("detectedAt")
    val detectedAt: Long = System.currentTimeMillis()
)

/**
 * Command priority levels
 */
enum class CommandPriority {
    @SerializedName("LOW")
    LOW,
    
    @SerializedName("NORMAL") 
    NORMAL,
    
    @SerializedName("HIGH")
    HIGH,
    
    @SerializedName("URGENT")
    URGENT,
    
    @SerializedName("CRITICAL")
    CRITICAL
}

/**
 * Policy violation severity levels
 */
enum class ViolationSeverity {
    @SerializedName("INFO")
    INFO,
    
    @SerializedName("WARNING")
    WARNING,
    
    @SerializedName("ERROR")
    ERROR,
    
    @SerializedName("CRITICAL")
    CRITICAL
}

/**
 * Application request from user
 */
data class AppRequest(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("userId")
    val userId: String,
    
    @SerializedName("deviceId")
    val deviceId: String,
    
    @SerializedName("appPackageName")
    val appPackageName: String? = null,
    
    @SerializedName("appName")
    val appName: String,
    
    @SerializedName("appVersion")
    val appVersion: String? = null,
    
    @SerializedName("requestReason")
    val requestReason: String,
    
    @SerializedName("priority")
    val priority: AppRequestPriority = AppRequestPriority.NORMAL,
    
    @SerializedName("status")
    val status: AppRequestStatus = AppRequestStatus.PENDING,
    
    @SerializedName("requestedAt")
    val requestedAt: Long = System.currentTimeMillis(),
    
    @SerializedName("approvedAt")
    val approvedAt: Long? = null,
    
    @SerializedName("approvedBy")
    val approvedBy: String? = null,
    
    @SerializedName("installedAt")
    val installedAt: Long? = null,
    
    @SerializedName("notes")
    val notes: String? = null
)

/**
 * Application installation package
 */
data class AppInstallationPackage(
    @SerializedName("packageName")
    val packageName: String,
    
    @SerializedName("appName")
    val appName: String,
    
    // Defaults below: the PROVISION_DEVICE payload carries packageName, appName,
    // apkUrl, apkHash, permissions, installOrder and isRequired. The remaining fields
    // are descriptive metadata the server does not send, so they default rather than
    // being required — a second, incompatible copy of this class previously existed in
    // DeviceProvisioningExecutor.kt purely to work around that, and the two could not
    // be passed to each other. That mismatch is why the agent did not compile.
    @SerializedName("version")
    val version: String = "",

    @SerializedName("apkUrl")
    val apkUrl: String,

    @SerializedName("apkHash")
    val apkHash: String,

    @SerializedName("size")
    val size: Long = 0L,

    @SerializedName("permissions")
    val permissions: List<String> = emptyList(),

    @SerializedName("minSdkVersion")
    val minSdkVersion: Int = 0,

    @SerializedName("targetSdkVersion")
    val targetSdkVersion: Int = 0,

    @SerializedName("isSystemApp")
    val isSystemApp: Boolean = false,

    @SerializedName("requiresDeviceAdmin")
    val requiresDeviceAdmin: Boolean = false,

    /** Order in which this app is installed during provisioning. */
    @SerializedName("installOrder")
    val installOrder: Int = 0,

    /** Whether provisioning fails if this app cannot be installed. */
    @SerializedName("isRequired")
    val isRequired: Boolean = false
)

/**
 * App request priority levels
 */
enum class AppRequestPriority {
    @SerializedName("LOW")
    LOW,
    
    @SerializedName("NORMAL")
    NORMAL,
    
    @SerializedName("HIGH")
    HIGH,
    
    @SerializedName("URGENT")
    URGENT
}

/**
 * App request status
 */
enum class AppRequestStatus {
    @SerializedName("PENDING")
    PENDING,
    
    @SerializedName("APPROVED")
    APPROVED,
    
    @SerializedName("REJECTED")
    REJECTED,
    
    @SerializedName("INSTALLING")
    INSTALLING,
    
    @SerializedName("INSTALLED")
    INSTALLED,
    
    @SerializedName("FAILED")
    FAILED,
    
    @SerializedName("CANCELLED")
    CANCELLED
}

/**
 * Heartbeat response from server
 */
data class HeartbeatResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("pendingCommands")
    val pendingCommands: Int,
    
    @SerializedName("nextHeartbeat")
    val nextHeartbeat: String? = null
)