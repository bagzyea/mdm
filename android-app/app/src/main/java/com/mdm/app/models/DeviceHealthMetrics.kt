package com.mdm.app.models

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.Debug
import android.os.Environment
import android.os.StatFs
import android.util.Log
import kotlin.math.roundToInt

/**
 * Data class representing device health metrics
 */
data class DeviceHealthMetrics(
    val batteryLevel: Int = 0,              // 0-100
    val isCharging: Boolean = false,
    val chargingStatus: String = "Unknown",

    val totalStorage: Long = 0,             // bytes
    val usedStorage: Long = 0,              // bytes
    val availableStorage: Long = 0,         // bytes

    val totalRam: Long = 0,                 // bytes
    val usedRam: Long = 0,                  // bytes
    val availableRam: Long = 0,             // bytes

    val timestamp: Long = System.currentTimeMillis()
) {
    val storageUsagePercent: Int
        get() = if (totalStorage > 0) ((usedStorage * 100) / totalStorage).toInt() else 0

    val ramUsagePercent: Int
        get() = if (totalRam > 0) ((usedRam * 100) / totalRam).toInt() else 0

    val storageString: String
        get() = "${formatBytes(usedStorage)} / ${formatBytes(totalStorage)}"

    val ramString: String
        get() = "${formatBytes(usedRam)} / ${formatBytes(totalRam)}"

    companion object {
        private const val TAG = "DeviceHealthMetrics"

        /**
         * Collect current device health metrics
         */
        fun collect(context: Context): DeviceHealthMetrics {
            return try {
                DeviceHealthMetrics(
                    batteryLevel = getBatteryLevel(context),
                    isCharging = isDeviceCharging(context),
                    chargingStatus = getChargingStatus(context),
                    totalStorage = getTotalStorage(),
                    usedStorage = getUsedStorage(),
                    availableStorage = getAvailableStorage(),
                    totalRam = getTotalRam(context),
                    usedRam = getUsedRam(context),
                    availableRam = getAvailableRam(context)
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error collecting device health metrics", e)
                DeviceHealthMetrics()
            }
        }

        private fun getBatteryLevel(context: Context): Int {
            return try {
                val ifilter = android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
                val batteryStatus = context.registerReceiver(null, ifilter)
                val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                if (level >= 0 && scale > 0) (level * 100) / scale else 0
            } catch (e: Exception) {
                Log.e(TAG, "Error getting battery level", e)
                0
            }
        }

        private fun isDeviceCharging(context: Context): Boolean {
            return try {
                val ifilter = android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
                val batteryStatus = context.registerReceiver(null, ifilter)
                val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
                status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
            } catch (e: Exception) {
                Log.e(TAG, "Error checking charging status", e)
                false
            }
        }

        private fun getChargingStatus(context: Context): String {
            return try {
                val ifilter = android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
                val batteryStatus = context.registerReceiver(null, ifilter)
                val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
                when (status) {
                    BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                    BatteryManager.BATTERY_STATUS_FULL -> "Full"
                    BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                    BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not Charging"
                    else -> "Unknown"
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error getting charging status", e)
                "Unknown"
            }
        }

        private fun getTotalStorage(): Long {
            return try {
                val stat = StatFs(Environment.getExternalStorageDirectory().path)
                stat.blockCountLong * stat.blockSizeLong
            } catch (e: Exception) {
                Log.e(TAG, "Error getting total storage", e)
                0
            }
        }

        private fun getUsedStorage(): Long {
            return try {
                getTotalStorage() - getAvailableStorage()
            } catch (e: Exception) {
                Log.e(TAG, "Error getting used storage", e)
                0
            }
        }

        private fun getAvailableStorage(): Long {
            return try {
                val stat = StatFs(Environment.getExternalStorageDirectory().path)
                stat.availableBlocksLong * stat.blockSizeLong
            } catch (e: Exception) {
                Log.e(TAG, "Error getting available storage", e)
                0
            }
        }

        private fun getTotalRam(context: Context): Long {
            return try {
                val runtime = Runtime.getRuntime()
                runtime.maxMemory()
            } catch (e: Exception) {
                Log.e(TAG, "Error getting total RAM", e)
                0
            }
        }

        private fun getUsedRam(context: Context): Long {
            return try {
                val runtime = Runtime.getRuntime()
                runtime.totalMemory() - runtime.freeMemory()
            } catch (e: Exception) {
                Log.e(TAG, "Error getting used RAM", e)
                0
            }
        }

        private fun getAvailableRam(context: Context): Long {
            return try {
                val runtime = Runtime.getRuntime()
                runtime.freeMemory()
            } catch (e: Exception) {
                Log.e(TAG, "Error getting available RAM", e)
                0
            }
        }

        private fun formatBytes(bytes: Long): String {
            return when {
                bytes <= 0L -> "0 B"
                bytes < 1024L -> "$bytes B"
                bytes < 1024L * 1024L -> String.format("%.1f KB", bytes / 1024.0)
                bytes < 1024L * 1024L * 1024L -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
                else -> String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0))
            }
        }
    }
}
