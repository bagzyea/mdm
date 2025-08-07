package com.mdm.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.mdm.app.admin.MDMDeviceAdminReceiver
import com.mdm.app.services.MDMService
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var adminComponent: ComponentName
    private lateinit var mdmService: MDMService
    
    companion object {
        private const val DEVICE_ADMIN_REQUEST_CODE = 1
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        initializeComponents()
        checkDeviceAdminStatus()
        
        // Initialize MDM service
        mdmService = MDMService(this)
        
        // Start device enrollment if not already enrolled
        lifecycleScope.launch {
            if (!mdmService.isDeviceEnrolled()) {
                enrollDevice()
            } else {
                startHeartbeat()
            }
        }
    }
    
    private fun initializeComponents() {
        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponent = ComponentName(this, MDMDeviceAdminReceiver::class.java)
    }
    
    private fun checkDeviceAdminStatus() {
        if (!devicePolicyManager.isAdminActive(adminComponent)) {
            requestDeviceAdminPermission()
        }
    }
    
    private fun requestDeviceAdminPermission() {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, 
                "This app requires device admin permissions to manage device security and policies.")
        }
        startActivityForResult(intent, DEVICE_ADMIN_REQUEST_CODE)
    }
    
    private suspend fun enrollDevice() {
        try {
            val success = mdmService.enrollDevice()
            if (success) {
                Toast.makeText(this, "Device enrolled successfully", Toast.LENGTH_SHORT).show()
                startHeartbeat()
            } else {
                Toast.makeText(this, "Device enrollment failed", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun startHeartbeat() {
        lifecycleScope.launch {
            mdmService.startHeartbeat()
        }
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        when (requestCode) {
            DEVICE_ADMIN_REQUEST_CODE -> {
                if (resultCode == RESULT_OK) {
                    Toast.makeText(this, "Device admin enabled", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Device admin is required for this app to function", 
                        Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }
}