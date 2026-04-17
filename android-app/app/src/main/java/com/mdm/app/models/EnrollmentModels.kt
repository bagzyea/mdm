package com.mdm.app.models

import com.google.gson.annotations.SerializedName

/**
 * Enrollment request model
 */
data class EnrollmentRequest(
    @SerializedName("deviceInfo")
    val deviceInfo: DeviceInfo,
    
    @SerializedName("enrollmentCode")
    val enrollmentCode: String? = null,
    
    @SerializedName("organizationId")
    val organizationId: String? = null
)

/**
 * Enrollment response model
 */
data class EnrollmentResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("deviceId")
    val deviceId: String?,
    
    @SerializedName("deviceToken")
    val deviceToken: String?,
    
    @SerializedName("serverEndpoints")
    val serverEndpoints: ServerEndpoints?,
    
    @SerializedName("policies")
    val policies: List<DevicePolicy>? = null,
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("error")
    val error: String? = null
)

/**
 * Server endpoints configuration
 */
data class ServerEndpoints(
    @SerializedName("api")
    val api: String,
    
    @SerializedName("websocket")
    val websocket: String,
    
    @SerializedName("fileServer")
    val fileServer: String? = null
)

/**
 * Application installation request
 */
data class AppInstallRequest(
    @SerializedName("packageName")
    val packageName: String,
    
    @SerializedName("appName")
    val appName: String,
    
    @SerializedName("version")
    val version: String,
    
    @SerializedName("downloadUrl")
    val downloadUrl: String,
    
    @SerializedName("fileHash")
    val fileHash: String? = null,
    
    @SerializedName("requiredPermissions")
    val requiredPermissions: List<String> = emptyList(),
    
    @SerializedName("isRequired")
    val isRequired: Boolean = true
)

/**
 * Application installation result
 */
data class AppInstallResult(
    @SerializedName("packageName")
    val packageName: String,
    
    @SerializedName("status")
    val status: String, // SUCCESS, ERROR, CANCELLED
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("installedVersion")
    val installedVersion: String? = null,
    
    @SerializedName("error")
    val error: String? = null,
    
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
)