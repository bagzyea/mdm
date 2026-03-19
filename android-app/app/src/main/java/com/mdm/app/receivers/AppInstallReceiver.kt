package com.mdm.app.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Broadcast receiver to handle app installation completion events
 */
class AppInstallReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "AppInstallReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.mdm.app.INSTALL_COMPLETE" -> {
                val packageName = intent.getStringExtra("packageName")
                val success = intent.getBooleanExtra("success", false)
                val error = intent.getStringExtra("error")
                
                Log.i(TAG, "App installation complete: $packageName, Success: $success, Error: $error")
                
                // Handle installation completion
                // This could notify the MDM service or update installation status
            }
        }
    }
}