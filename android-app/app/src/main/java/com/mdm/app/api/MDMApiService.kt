package com.mdm.app.api

import com.mdm.app.models.*
import retrofit2.Response
import retrofit2.http.*
import com.google.gson.annotations.SerializedName

/**
 * MDM API service interface for communication with the server
 */
interface MDMApiService {
    
    /**
     * Enroll device with MDM server
     */
    @POST("devices/enroll")
    suspend fun enrollDevice(@Body request: EnrollmentRequest): Response<EnrollmentResponse>
    
    /**
     * Update device information
     */
    @PUT("devices/{deviceId}")
    suspend fun updateDevice(
        @Path("deviceId") deviceId: String,
        @Body deviceInfo: DeviceInfo
    ): Response<DeviceInfo>
    
    /**
     * Send device status update
     */
    @PUT("devices/{deviceId}/status")
    suspend fun updateDeviceStatus(
        @Path("deviceId") deviceId: String,
        @Body statusUpdate: DeviceStatusUpdate
    ): Response<ApiResponse>
    
    /**
     * Send device heartbeat with comprehensive data
     */
    @POST("devices/{deviceId}/heartbeat")
    suspend fun sendHeartbeat(
        @Path("deviceId") deviceId: String,
        @Body heartbeatData: DeviceStatusUpdate
    ): Response<HeartbeatResponse>
    
    /**
     * Get device policies
     */
    @GET("devices/{deviceId}/policies")
    suspend fun getDevicePolicies(
        @Path("deviceId") deviceId: String
    ): Response<List<DevicePolicy>>
    
    /**
     * Get pending commands for device
     */
    @GET("devices/{deviceId}/commands/pending")
    suspend fun getPendingCommands(
        @Path("deviceId") deviceId: String
    ): Response<List<RemoteCommand>>
    
    /**
     * Send command execution result
     */
    @POST("commands/{commandId}/result")
    suspend fun sendCommandResult(
        @Path("commandId") commandId: String,
        @Body result: CommandResult
    ): Response<ApiResponse>
    
    /**
     * Report application installation result
     */
    @POST("devices/{deviceId}/apps/install-result")
    suspend fun reportAppInstallResult(
        @Path("deviceId") deviceId: String,
        @Body result: AppInstallResult
    ): Response<ApiResponse>
    
    /**
     * Get device configuration
     */
    @GET("devices/{deviceId}/config")
    suspend fun getDeviceConfig(
        @Path("deviceId") deviceId: String
    ): Response<DeviceConfig>
    
    /**
     * Send device logs
     */
    @POST("devices/{deviceId}/logs")
    suspend fun sendDeviceLogs(
        @Path("deviceId") deviceId: String,
        @Body logs: List<DeviceLog>
    ): Response<ApiResponse>
    
    /**
     * Check for software updates
     */
    @GET("devices/{deviceId}/updates")
    suspend fun checkUpdates(
        @Path("deviceId") deviceId: String
    ): Response<List<SoftwareUpdate>>
    
    /**
     * Submit application request
     */
    @POST("devices/{deviceId}/app-requests")
    suspend fun submitAppRequest(
        @Path("deviceId") deviceId: String,
        @Body request: AppRequest
    ): Response<AppRequestResponse>
}

/**
 * App installation result model
 */
data class AppInstallResult(
    @SerializedName("packageName")
    val packageName: String,
    
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("error")
    val error: String? = null,
    
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Device configuration model
 */
data class DeviceConfig(
    @com.google.gson.annotations.SerializedName("heartbeatInterval")
    val heartbeatInterval: Long = 30000, // 30 seconds
    
    @com.google.gson.annotations.SerializedName("locationUpdateInterval")
    val locationUpdateInterval: Long = 300000, // 5 minutes
    
    @com.google.gson.annotations.SerializedName("logUploadInterval")
    val logUploadInterval: Long = 3600000, // 1 hour
    
    @com.google.gson.annotations.SerializedName("maxLogEntries")
    val maxLogEntries: Int = 1000,
    
    @com.google.gson.annotations.SerializedName("allowedAppSources")
    val allowedAppSources: List<String> = emptyList(),
    
    @com.google.gson.annotations.SerializedName("restrictedApps")
    val restrictedApps: List<String> = emptyList()
)

/**
 * Device log model
 */
data class DeviceLog(
    @com.google.gson.annotations.SerializedName("level")
    val level: String, // ERROR, WARN, INFO, DEBUG
    
    @com.google.gson.annotations.SerializedName("tag")
    val tag: String,
    
    @com.google.gson.annotations.SerializedName("message")
    val message: String,
    
    @com.google.gson.annotations.SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis(),
    
    @com.google.gson.annotations.SerializedName("stackTrace")
    val stackTrace: String? = null
)

/**
 * Software update model
 */
data class SoftwareUpdate(
    @com.google.gson.annotations.SerializedName("packageName")
    val packageName: String,
    
    @com.google.gson.annotations.SerializedName("currentVersion")
    val currentVersion: String,
    
    @com.google.gson.annotations.SerializedName("availableVersion")
    val availableVersion: String,
    
    @com.google.gson.annotations.SerializedName("downloadUrl")
    val downloadUrl: String,
    
    @com.google.gson.annotations.SerializedName("isRequired")
    val isRequired: Boolean = false,
    
    @com.google.gson.annotations.SerializedName("releaseNotes")
    val releaseNotes: String? = null
)

/**
 * App request response model
 */
data class AppRequestResponse(
    @com.google.gson.annotations.SerializedName("success")
    val success: Boolean,
    
    @com.google.gson.annotations.SerializedName("requestId")
    val requestId: String? = null,
    
    @com.google.gson.annotations.SerializedName("message")
    val message: String? = null,
    
    @com.google.gson.annotations.SerializedName("error")
    val error: String? = null
)