package com.mdm.app.utils

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.mdm.app.models.*
import java.net.NetworkInterface
import java.util.*

/**
 * Utility class for collecting device information
 */
class DeviceInfoCollector(private val context: Context) {
    
    companion object {
        private const val TAG = "DeviceInfoCollector"
    }
    
    /**
     * Collect comprehensive device information
     */
    fun collectDeviceInfo(deviceId: String): DeviceInfo {
        Log.i(TAG, "Collecting device information")
        
        return DeviceInfo(
            deviceId = deviceId,
            deviceName = getDeviceName(),
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            osVersion = Build.VERSION.RELEASE,
            apiLevel = Build.VERSION.SDK_INT,
            buildNumber = Build.DISPLAY,
            serialNumber = getSerialNumber(),
            imei = getIMEI(),
            macAddress = getMacAddress(),
            batteryLevel = getBatteryLevel(),
            isCharging = isCharging(),
            storageTotal = getTotalStorage(),
            storageUsed = getUsedStorage(),
            ramTotal = getTotalRAM(),
            ramUsed = getUsedRAM(),
            screenResolution = getScreenResolution(),
            location = getCurrentLocation(),
            networkInfo = getNetworkInfo(),
            installedApps = getInstalledApps(),
            isRooted = isDeviceRooted(),
            isDeviceAdminActive = isDeviceAdminActive(),
            securityPatchLevel = getSecurityPatchLevel(),
            lastUpdated = System.currentTimeMillis()
        )
    }
    
    /**
     * Get device name
     */
    private fun getDeviceName(): String {
        return Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
            ?: "${Build.MANUFACTURER} ${Build.MODEL}"
    }
    
    /**
     * Get device serial number
     */
    @SuppressLint("HardwareIds", "MissingPermission")
    private fun getSerialNumber(): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_PHONE_STATE) 
                    == PackageManager.PERMISSION_GRANTED) {
                    Build.getSerial()
                } else null
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot access serial number", e)
            null
        }
    }
    
    /**
     * Get device IMEI
     */
    @SuppressLint("HardwareIds")
    private fun getIMEI(): String? {
        return try {
            if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_PHONE_STATE) 
                == PackageManager.PERMISSION_GRANTED) {
                val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    telephonyManager.imei
                } else {
                    @Suppress("DEPRECATION")
                    telephonyManager.deviceId
                }
            } else null
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot access IMEI", e)
            null
        }
    }
    
    /**
     * Get MAC address
     */
    @SuppressLint("HardwareIds")
    private fun getMacAddress(): String? {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // For Android 6.0+, get MAC from network interfaces
                val interfaces = NetworkInterface.getNetworkInterfaces()
                for (networkInterface in Collections.list(interfaces)) {
                    if (networkInterface.name.equals("wlan0", ignoreCase = true)) {
                        val mac = networkInterface.hardwareAddress
                        if (mac != null) {
                            val sb = StringBuilder()
                            for (i in mac.indices) {
                                sb.append(String.format("%02X%s", mac[i], if (i < mac.size - 1) ":" else ""))
                            }
                            return sb.toString()
                        }
                    }
                }
                null
            } else {
                @Suppress("DEPRECATION")
                wifiManager.connectionInfo.macAddress
            }
        } catch (e: Exception) {
            Log.w(TAG, "Cannot access MAC address", e)
            null
        }
    }
    
    /**
     * Get battery level
     */
    private fun getBatteryLevel(): Int {
        return try {
            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level != -1 && scale != -1) {
                (level * 100 / scale.toFloat()).toInt()
            } else 0
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get battery level", e)
            0
        }
    }
    
    /**
     * Check if device is charging
     */
    private fun isCharging(): Boolean {
        return try {
            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            status == BatteryManager.BATTERY_STATUS_CHARGING || 
            status == BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get charging status", e)
            false
        }
    }
    
    /**
     * Get total storage
     */
    private fun getTotalStorage(): Long {
        return try {
            val internalDir = context.filesDir
            val stat = android.os.StatFs(internalDir.path)
            stat.totalBytes
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get total storage", e)
            0L
        }
    }
    
    /**
     * Get used storage
     */
    private fun getUsedStorage(): Long {
        return try {
            val internalDir = context.filesDir
            val stat = android.os.StatFs(internalDir.path)
            stat.totalBytes - stat.availableBytes
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get used storage", e)
            0L
        }
    }
    
    /**
     * Get total RAM
     */
    private fun getTotalRAM(): Long {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val memInfo = android.app.ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            memInfo.totalMem
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get total RAM", e)
            0L
        }
    }
    
    /**
     * Get used RAM
     */
    private fun getUsedRAM(): Long {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val memInfo = android.app.ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            memInfo.totalMem - memInfo.availMem
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get used RAM", e)
            0L
        }
    }
    
    /**
     * Get screen resolution
     */
    private fun getScreenResolution(): String {
        return try {
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val displayMetrics = DisplayMetrics()
            windowManager.defaultDisplay.getMetrics(displayMetrics)
            "${displayMetrics.widthPixels}x${displayMetrics.heightPixels}"
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get screen resolution", e)
            "unknown"
        }
    }
    
    /**
     * Get current location
     */
    private fun getCurrentLocation(): DeviceLocation? {
        return try {
            if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) 
                == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) 
                == PackageManager.PERMISSION_GRANTED) {
                
                val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
                val providers = locationManager.getProviders(true)
                
                for (provider in providers) {
                    val location = locationManager.getLastKnownLocation(provider)
                    if (location != null) {
                        return DeviceLocation(
                            latitude = location.latitude,
                            longitude = location.longitude,
                            accuracy = location.accuracy,
                            timestamp = location.time
                        )
                    }
                }
            }
            null
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot access location", e)
            null
        } catch (e: Exception) {
            Log.w(TAG, "Error getting location", e)
            null
        }
    }
    
    /**
     * Get network information
     */
    private fun getNetworkInfo(): NetworkInfo {
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork
            val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
            
            val connectionType = when {
                networkCapabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "WiFi"
                networkCapabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Cellular"
                networkCapabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "Ethernet"
                else -> "Unknown"
            }
            
            val isConnected = networkCapabilities != null
            
            // Get WiFi details if connected to WiFi
            var wifiSSID: String? = null
            var wifiSignalStrength: Int? = null
            
            if (connectionType == "WiFi") {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val wifiInfo = wifiManager.connectionInfo
                wifiSSID = wifiInfo?.ssid?.replace("\"", "")
                wifiSignalStrength = wifiInfo?.rssi
            }
            
            NetworkInfo(
                isConnected = isConnected,
                connectionType = connectionType,
                wifiSSID = wifiSSID,
                signalStrength = wifiSignalStrength
            )
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get network info", e)
            NetworkInfo(
                isConnected = false,
                connectionType = "Unknown"
            )
        }
    }
    
    /**
     * Get installed apps
     */
    private fun getInstalledApps(): List<InstalledApp> {
        return try {
            val packageManager = context.packageManager
            val packages = packageManager.getInstalledPackages(PackageManager.GET_META_DATA)
            
            packages.map { packageInfo ->
                InstalledApp(
                    packageName = packageInfo.packageName,
                    appName = packageInfo.applicationInfo?.loadLabel(packageManager)?.toString() ?: "Unknown",
                    versionName = packageInfo.versionName ?: "unknown",
                    versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        packageInfo.longVersionCode.toInt()
                    } else {
                        @Suppress("DEPRECATION")
                        packageInfo.versionCode
                    },
                    isSystemApp = ((packageInfo.applicationInfo?.flags ?: 0) and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
                )
            }.take(100) // Limit to first 100 apps to avoid large payloads
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get installed apps", e)
            emptyList()
        }
    }
    
    /**
     * Check if device is rooted
     */
    private fun isDeviceRooted(): Boolean {
        return try {
            // Check for common root files
            val rootPaths = arrayOf(
                "/system/app/Superuser.apk",
                "/sbin/su",
                "/system/bin/su",
                "/system/xbin/su",
                "/data/local/xbin/su",
                "/data/local/bin/su",
                "/system/sd/xbin/su",
                "/system/bin/failsafe/su",
                "/data/local/su"
            )
            
            for (path in rootPaths) {
                if (java.io.File(path).exists()) {
                    return true
                }
            }
            
            // Check for root management apps
            val rootApps = arrayOf(
                "com.noshufou.android.su",
                "com.noshufou.android.su.elite",
                "eu.chainfire.supersu",
                "com.koushikdutta.superuser",
                "com.thirdparty.superuser",
                "com.yellowes.su"
            )
            
            val packageManager = context.packageManager
            for (packageName in rootApps) {
                try {
                    packageManager.getPackageInfo(packageName, 0)
                    return true
                } catch (e: PackageManager.NameNotFoundException) {
                    // App not found, continue checking
                }
            }
            
            false
        } catch (e: Exception) {
            Log.w(TAG, "Cannot check root status", e)
            false
        }
    }
    
    /**
     * Check if device admin is active
     */
    private fun isDeviceAdminActive(): Boolean {
        return try {
            val devicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) 
                as android.app.admin.DevicePolicyManager
            val componentName = android.content.ComponentName(context, 
                com.mdm.app.admin.MDMDeviceAdminReceiver::class.java)
            devicePolicyManager.isAdminActive(componentName)
        } catch (e: Exception) {
            Log.w(TAG, "Cannot check device admin status", e)
            false
        }
    }
    
    /**
     * Get security patch level
     */
    private fun getSecurityPatchLevel(): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Build.VERSION.SECURITY_PATCH
            } else null
        } catch (e: Exception) {
            Log.w(TAG, "Cannot get security patch level", e)
            null
        }
    }
}