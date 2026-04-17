package com.mdm.app.models

import com.google.gson.annotations.SerializedName

/**
 * Device information model for enrollment and status reporting
 */
data class DeviceInfo(
    @SerializedName("deviceId")
    val deviceId: String,
    
    @SerializedName("deviceName")
    val deviceName: String? = null,
    
    @SerializedName("manufacturer")
    val manufacturer: String,
    
    @SerializedName("model")
    val model: String,
    
    @SerializedName("osVersion")
    val osVersion: String,
    
    @SerializedName("apiLevel")
    val apiLevel: Int,
    
    @SerializedName("buildNumber")
    val buildNumber: String? = null,
    
    @SerializedName("serialNumber")
    val serialNumber: String? = null,
    
    @SerializedName("imei")
    val imei: String? = null,
    
    @SerializedName("macAddress")
    val macAddress: String? = null,
    
    @SerializedName("batteryLevel")
    val batteryLevel: Int? = null,
    
    @SerializedName("isCharging")
    val isCharging: Boolean = false,
    
    @SerializedName("storageTotal")
    val storageTotal: Long? = null,
    
    @SerializedName("storageUsed")
    val storageUsed: Long? = null,
    
    @SerializedName("ramTotal")
    val ramTotal: Long? = null,
    
    @SerializedName("ramUsed")
    val ramUsed: Long? = null,
    
    @SerializedName("screenResolution")
    val screenResolution: String? = null,
    
    @SerializedName("location")
    val location: DeviceLocation? = null,
    
    @SerializedName("networkInfo")
    val networkInfo: NetworkInfo? = null,
    
    @SerializedName("installedApps")
    val installedApps: List<InstalledApp>? = null,
    
    @SerializedName("isRooted")
    val isRooted: Boolean = false,
    
    @SerializedName("isDeviceAdminActive")
    val isDeviceAdminActive: Boolean = false,
    
    @SerializedName("securityPatchLevel")
    val securityPatchLevel: String? = null,
    
    @SerializedName("lastUpdated")
    val lastUpdated: Long = System.currentTimeMillis()
)

/**
 * Installed application information
 */
data class InstalledApp(
    @SerializedName("packageName")
    val packageName: String,
    
    @SerializedName("appName")
    val appName: String,
    
    @SerializedName("versionName")
    val versionName: String,
    
    @SerializedName("versionCode")
    val versionCode: Int,
    
    @SerializedName("isSystemApp")
    val isSystemApp: Boolean = false,
    
    @SerializedName("installTime")
    val installTime: Long? = null,
    
    @SerializedName("lastUpdateTime")
    val lastUpdateTime: Long? = null,
    
    @SerializedName("dataUsage")
    val dataUsage: Long? = null
)

/**
 * Network information
 */
data class NetworkInfo(
    @SerializedName("isConnected")
    val isConnected: Boolean,
    
    @SerializedName("connectionType")
    val connectionType: String, // WIFI, CELLULAR, ETHERNET, etc.
    
    @SerializedName("wifiSSID")
    val wifiSSID: String? = null,
    
    @SerializedName("signalStrength")
    val signalStrength: Int? = null,
    
    @SerializedName("ipAddress")
    val ipAddress: String? = null,
    
    @SerializedName("carrierName")
    val carrierName: String? = null
)

/**
 * Device location information
 */
data class DeviceLocation(
    @SerializedName("latitude")
    val latitude: Double,
    
    @SerializedName("longitude")
    val longitude: Double,
    
    @SerializedName("accuracy")
    val accuracy: Float? = null,
    
    @SerializedName("altitude")
    val altitude: Double? = null,
    
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
)