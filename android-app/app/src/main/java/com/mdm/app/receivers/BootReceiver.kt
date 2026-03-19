package com.mdm.app.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.app.services.MDMBackgroundService
import com.mdm.app.utils.PreferenceManager

/**
 * Boot receiver to automatically start MDM services after device restart
 */
class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "Boot receiver triggered: ${intent.action}")
        
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                handleBootCompleted(context)
            }
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_PACKAGE_REPLACED -> {
                if (intent.dataString?.contains(context.packageName) == true) {
                    handlePackageReplaced(context)
                }
            }
        }
    }
    
    /**
     * Handle device boot completed
     */
    private fun handleBootCompleted(context: Context) {
        Log.i(TAG, "Device boot completed")
        
        val preferenceManager = PreferenceManager.getInstance(context)
        
        // Only start services if device is enrolled
        if (preferenceManager.isDeviceEnrolled()) {
            Log.i(TAG, "Device is enrolled, starting MDM services")
            startMDMServices(context)
        } else {
            Log.i(TAG, "Device not enrolled, skipping MDM service start")
        }
    }
    
    /**
     * Handle package replaced (app update)
     */
    private fun handlePackageReplaced(context: Context) {
        Log.i(TAG, "MDM app package replaced/updated")
        
        val preferenceManager = PreferenceManager.getInstance(context)
        
        // Restart services after app update if device is enrolled
        if (preferenceManager.isDeviceEnrolled()) {
            Log.i(TAG, "Restarting MDM services after app update")
            startMDMServices(context)
        }
    }
    
    /**
     * Start MDM background services
     */
    private fun startMDMServices(context: Context) {
        try {
            val serviceIntent = Intent(context, MDMBackgroundService::class.java)
            serviceIntent.action = MDMBackgroundService.ACTION_START_MDM
            
            // Start as foreground service
            context.startForegroundService(serviceIntent)
            
            Log.i(TAG, "MDM background service started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MDM background service", e)
        }
    }
}