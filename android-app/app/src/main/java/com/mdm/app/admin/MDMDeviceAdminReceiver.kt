package com.mdm.app.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.app.services.MDMService

/**
 * Device Admin Receiver for MDM functionality
 * Handles device admin events and policy enforcement
 */
class MDMDeviceAdminReceiver : DeviceAdminReceiver() {
    
    companion object {
        private const val TAG = "MDMDeviceAdminReceiver"
    }
    
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device Admin enabled")
        
        // Notify MDM service that admin is enabled
        val mdmService = MDMService(context)
        mdmService.onDeviceAdminEnabled()
    }
    
    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "Device Admin disabled")
        
        // Notify MDM service that admin is disabled
        val mdmService = MDMService(context)
        mdmService.onDeviceAdminDisabled()
    }
    
    override fun onPasswordChanged(context: Context, intent: Intent, user: android.os.UserHandle) {
        super.onPasswordChanged(context, intent, user)
        Log.i(TAG, "Device password changed")
        
        // Notify server of password change
        val mdmService = MDMService(context)
        mdmService.notifyPasswordChanged()
    }
    
    override fun onPasswordFailed(context: Context, intent: Intent, user: android.os.UserHandle) {
        super.onPasswordFailed(context, intent, user)
        Log.w(TAG, "Device password failed")
        
        // Notify server of failed password attempt
        val mdmService = MDMService(context)
        mdmService.notifyPasswordFailed()
    }
    
    override fun onPasswordSucceeded(context: Context, intent: Intent, user: android.os.UserHandle) {
        super.onPasswordSucceeded(context, intent, user)
        Log.i(TAG, "Device password succeeded")
        
        // Reset failed password attempts counter
        val mdmService = MDMService(context)
        mdmService.resetFailedPasswordAttempts()
    }
    
    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        Log.i(TAG, "Entering lock task mode: $pkg")
    }
    
    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        Log.i(TAG, "Exiting lock task mode")
    }
    
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.i(TAG, "Profile provisioning complete")
        
        // Notify server that provisioning is complete
        val mdmService = MDMService(context)
        mdmService.notifyProvisioningComplete()
    }
    
    override fun onBugreportFailed(context: Context, intent: Intent, failureCode: Int) {
        super.onBugreportFailed(context, intent, failureCode)
        Log.e(TAG, "Bug report failed with code: $failureCode")
    }
    
    override fun onBugreportShared(context: Context, intent: Intent, bugreportHash: String) {
        super.onBugreportShared(context, intent, bugreportHash)
        Log.i(TAG, "Bug report shared: $bugreportHash")
    }
}