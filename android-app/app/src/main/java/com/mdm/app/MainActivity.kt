package com.mdm.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.snackbar.Snackbar
import android.widget.EditText
import com.mdm.app.admin.MDMDeviceAdminReceiver
import com.mdm.app.config.AppConfig
import com.mdm.app.services.MDMService
import com.mdm.app.utils.PreferenceManager
import com.mdm.app.websocket.CommandListener
import com.mdm.app.databinding.ActivityMainBinding
import com.mdm.app.models.DeviceHealthMetrics
import com.google.gson.Gson
import com.mdm.app.models.DevicePolicy
import com.mdm.app.policy.PolicyEngine
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_ENABLE_ADMIN = 1001
        private const val REQUEST_PERMISSIONS = 1002
        
        // Required permissions based on Android version
        private val REQUIRED_PERMISSIONS_LEGACY = arrayOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.READ_EXTERNAL_STORAGE,
            android.Manifest.permission.WRITE_EXTERNAL_STORAGE
        )
        
        private val REQUIRED_PERMISSIONS_MODERN = arrayOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.READ_MEDIA_IMAGES,
            android.Manifest.permission.READ_MEDIA_VIDEO,
            android.Manifest.permission.READ_MEDIA_AUDIO
        )
    }
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var mdmService: MDMService
    private lateinit var preferenceManager: PreferenceManager
    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var deviceAdminComponent: ComponentName
    private lateinit var policyEngine: PolicyEngine
    private var healthMetricsRefreshJob: Job? = null
    
    // UI Components
    private lateinit var statusIndicator: View
    private lateinit var statusTextView: TextView
    private lateinit var statusProgressBar: LinearProgressIndicator

    // Device Health Metrics UI
    private lateinit var batteryPercentage: TextView
    private lateinit var batteryProgressBar: LinearProgressIndicator
    private lateinit var chargingStatus: TextView
    private lateinit var storagePercentage: TextView
    private lateinit var storageProgressBar: LinearProgressIndicator
    private lateinit var ramPercentage: TextView
    private lateinit var ramProgressBar: LinearProgressIndicator
    
    // Buttons - REMOVED DANGEROUS BUTTONS: lockDeviceButton, enableKioskButton, disableKioskButton, startServicesButton, stopServicesButton
    private lateinit var refreshStatusButton: MaterialButton // Primary status refresh button
    private lateinit var getDeviceInfoButton: MaterialButton
    private lateinit var requestAppButton: MaterialButton
    private lateinit var appInventoryButton: MaterialButton
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        initializeComponents()
        setupUI()
        checkPermissions()
        updateUI()
        setupObservers()
        
        // Start fallback 4-hour background command polling
        com.mdm.app.services.CommandPollingWorker.schedulePeriodicPolling(this)
    }
    
    private fun initializeComponents() {
        mdmService = MDMService(this)
        preferenceManager = PreferenceManager.getInstance(this)
        devicePolicyManager = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        deviceAdminComponent = ComponentName(this, MDMDeviceAdminReceiver::class.java)
        policyEngine = PolicyEngine(this)

        // Register as the CommandListener so WebSocket commands reach handleServerCommand()
        mdmService.setCommandListener(object : CommandListener {
            override fun onServerCommand(command: JSONObject) {
                handleServerCommand(command)
            }
        })
    }
    
    private fun setupUI() {
        // Initialize UI components
        statusIndicator = binding.statusIndicator
        statusTextView = binding.statusTextView
        statusProgressBar = binding.statusProgressBar

        // Initialize device health metrics UI components
        try {
            batteryPercentage = binding.root.findViewById(R.id.batteryPercentage)
            batteryProgressBar = binding.root.findViewById(R.id.batteryProgressBar)
            chargingStatus = binding.root.findViewById(R.id.chargingStatus)
            storagePercentage = binding.root.findViewById(R.id.storagePercentage)
            storageProgressBar = binding.root.findViewById(R.id.storageProgressBar)
            ramPercentage = binding.root.findViewById(R.id.ramPercentage)
            ramProgressBar = binding.root.findViewById(R.id.ramProgressBar)
        } catch (e: Exception) {
            Log.w(TAG, "Some health metrics UI components not found", e)
        }
        
        // Initialize buttons
        refreshStatusButton = binding.refreshStatusButton
        getDeviceInfoButton = binding.getDeviceInfoButton
        requestAppButton = binding.requestAppButton
        appInventoryButton = binding.appInventoryButton
        
        // Use default URL or stored URL
        val currentServerUrl = preferenceManager.getServerUrl()
        if (currentServerUrl.isNullOrEmpty()) {
            val defaultUrl = if (isRunningOnEmulator()) {
                AppConfig.Server.BASE_API_URL_FALLBACK
            } else {
                AppConfig.Server.BASE_API_URL
            }
            preferenceManager.setServerUrl(defaultUrl)
        }
        
        // Set up button listeners
        setupButtonListeners()
    }
    
    private fun setupButtonListeners() {
        // SAFE: Status and information
        refreshStatusButton.setOnClickListener { refreshDeviceStatus() }
        getDeviceInfoButton.setOnClickListener { getDeviceInfo() }

        // SAFE: App management
        requestAppButton.setOnClickListener { requestApp() }
        appInventoryButton.setOnClickListener { getAppInventory() }
    }
    
    private fun setupObservers() {
        // Observe MDM service status changes
        mdmService.connectionStatus.observe(this) { isConnected ->
            updateWebSocketStatus(isConnected)
            updateStatusIndicator(isConnected)
        }

        // Observe device enrollment status
        mdmService.enrollmentStatus.observe(this) { isEnrolled ->
            updateEnrollmentUI(isEnrolled)
        }

        // Start periodic health metrics refresh (every 5 seconds)
        startHealthMetricsRefresh()
    }

    private fun startHealthMetricsRefresh() {
        healthMetricsRefreshJob = lifecycleScope.launch {
            while (true) {
                try {
                    updateHealthMetrics()
                    delay(5000) // Update every 5 seconds
                } catch (e: Exception) {
                    Log.e(TAG, "Error in periodic health metrics refresh", e)
                    delay(5000) // Still wait before retrying
                }
            }
        }
    }
    
    private fun checkPermissions() {
        val requiredPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            REQUIRED_PERMISSIONS_MODERN
        } else {
            REQUIRED_PERMISSIONS_LEGACY
        }
        
        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missingPermissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missingPermissions.toTypedArray(), REQUEST_PERMISSIONS)
        }
    }
    
    private fun updateUI() {
        val isEnrolled = mdmService.isDeviceEnrolled()
        val isAdminActive = devicePolicyManager.isAdminActive(deviceAdminComponent)
        
        // Update status
        when {
            !isAdminActive -> updateStatus("Device Admin not enabled", StatusType.WARNING)
            !isEnrolled -> updateStatus("Device not enrolled", StatusType.INFO)
            else -> updateStatus("Device enrolled and ready", StatusType.SUCCESS)
        }
        
        // Update button states
        updateButtonStates(isAdminActive, isEnrolled)

        // Update WebSocket status
        updateWebSocketStatus(mdmService.isWebSocketConnected())
        
        // Display device info if enrolled
        if (isEnrolled) {
            displayDeviceInfo()
        }
    }
    
    private fun updateButtonStates(isAdminActive: Boolean, isEnrolled: Boolean) {
        val mdmEnabled = isAdminActive && isEnrolled

        // Safe functions - enabled when MDM is active
        getDeviceInfoButton.isEnabled = mdmEnabled
        requestAppButton.isEnabled = mdmEnabled
        appInventoryButton.isEnabled = mdmEnabled

        // Always enabled
        refreshStatusButton.isEnabled = true
    }
    
    private fun updateStatus(message: String, type: StatusType = StatusType.INFO) {
        runOnUiThread {
            statusTextView.text = message
            updateStatusIndicator(type)
            Log.i(TAG, "Status: $message")
        }
    }
    
    private fun updateStatusIndicator(type: StatusType) {
        val color = when (type) {
            StatusType.SUCCESS -> ContextCompat.getColor(this, R.color.statusOnline)
            StatusType.WARNING -> ContextCompat.getColor(this, R.color.statusWarning)
            StatusType.ERROR -> ContextCompat.getColor(this, R.color.statusError)
            StatusType.INFO -> ContextCompat.getColor(this, R.color.statusInfo)
        }
        statusIndicator.setBackgroundColor(color)
    }
    
    private fun updateStatusIndicator(isConnected: Boolean) {
        val color = if (isConnected) {
            ContextCompat.getColor(this, R.color.statusOnline)
        } else {
            ContextCompat.getColor(this, R.color.statusOffline)
        }
        statusIndicator.setBackgroundColor(color)
    }
    
    private fun showProgress(show: Boolean) {
        runOnUiThread {
            statusProgressBar.visibility = if (show) View.VISIBLE else View.GONE
        }
    }
    
    private fun showSnackbar(message: String, duration: Int = Snackbar.LENGTH_SHORT) {
        Snackbar.make(binding.root, message, duration).show()
    }
    
    private fun enableDeviceAdmin() {
        if (!devicePolicyManager.isAdminActive(deviceAdminComponent)) {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, deviceAdminComponent)
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, 
                    "This app requires Device Administrator permissions to manage device policies and security.")
            }
            @Suppress("DEPRECATION")
            startActivityForResult(intent, REQUEST_ENABLE_ADMIN)
        }
    }
    
    private fun enrollDevice() {
        // Enrollment code should be obtained from the device initialization or MDM server
        // For now, enrollment happens automatically during device registration
        val enrollmentCode = preferenceManager.getEnrollmentCode() ?: ""
        if (enrollmentCode.isEmpty()) {
            showSnackbar("No enrollment code found", Snackbar.LENGTH_LONG)
            return
        }
        
        showProgress(true)
        updateStatus("Enrolling device...", StatusType.INFO)
        
        lifecycleScope.launch {
            try {
                val success = mdmService.enrollDevice(enrollmentCode)
                if (success) {
                    updateStatus("Device enrolled successfully!", StatusType.SUCCESS)
                    showSnackbar("Device enrolled successfully!")
                    updateUI()
                } else {
                    updateStatus("Enrollment failed", StatusType.ERROR)
                    showSnackbar("Enrollment failed. Please check your enrollment code.", Snackbar.LENGTH_LONG)
                }
            } catch (e: Exception) {
                updateStatus("Enrollment error: ${e.message}", StatusType.ERROR)
                showSnackbar("Enrollment error: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Enrollment error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    // REMOVED DANGEROUS FUNCTIONS FOR SECURITY:
    // - startMDMServices() - now server-controlled only
    // - stopMDMServices() - now server-controlled only
    // - lockDevice() - now server-controlled only
    // These functions can now only be executed via server commands for security
    
    private fun getDeviceInfo() {
        showProgress(true)
        updateStatus("Collecting device information...", StatusType.INFO)
        
        lifecycleScope.launch {
            try {
                val deviceInfo = mdmService.getDeviceInfo()
                displayDeviceInfoDialog(deviceInfo)
                updateStatus("Device information collected", StatusType.SUCCESS)
            } catch (e: Exception) {
                updateStatus("Failed to get device info: ${e.message}", StatusType.ERROR)
                showSnackbar("Failed to get device info: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Get device info error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    // REMOVED DANGEROUS KIOSK FUNCTIONS FOR SECURITY:
    // - enableKiosk() - now server-controlled only to prevent accidental lockouts
    // - disableKiosk() - now server-controlled only for consistency
    // These functions are replaced by server command handlers below
    
    // Server-initiated kiosk enable (replaces user enableKiosk)
    private suspend fun executeServerKioskEnable(payload: org.json.JSONObject?) {
        if (devicePolicyManager.isAdminActive(deviceAdminComponent)) {
            val allowedPackages = payload?.optJSONArray("allowedPackages")?.let { 
                (0 until it.length()).map { i -> it.getString(i) }.toTypedArray()
            } ?: arrayOf(packageName)
            
            devicePolicyManager.setLockTaskPackages(deviceAdminComponent, allowedPackages)
            startLockTask()
            preferenceManager.setKioskModeEnabled(true)
            updateStatus("Kiosk mode enabled by administrator", StatusType.INFO)
            
            // Notify server of successful activation
            if (mdmService.isWebSocketConnected()) {
                val kioskData = mapOf(
                    "type" to "kiosk_mode_changed",
                    "enabled" to true,
                    "timestamp" to System.currentTimeMillis()
                )
                mdmService.sendTestMessage(kioskData)
            }
        } else {
            throw Exception("Device admin not active")
        }
    }
    
    // Server-initiated kiosk disable (replaces user disableKiosk)
    private suspend fun executeServerKioskDisable() {
        if (devicePolicyManager.isAdminActive(deviceAdminComponent)) {
            devicePolicyManager.setLockTaskPackages(deviceAdminComponent, arrayOf())
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                stopLockTask()
            }
            preferenceManager.setKioskModeEnabled(false)
            updateStatus("Kiosk mode disabled by administrator", StatusType.INFO)
            
            // Notify server of successful deactivation
            if (mdmService.isWebSocketConnected()) {
                val kioskData = mapOf(
                    "type" to "kiosk_mode_changed",
                    "enabled" to false,
                    "timestamp" to System.currentTimeMillis()
                )
                mdmService.sendTestMessage(kioskData)
            }
        } else {
            throw Exception("Device admin not active")
        }
    }
    
    // Server-initiated device lock (replaces user lockDevice)
    private suspend fun executeServerLockDevice(payload: org.json.JSONObject?) {
        if (devicePolicyManager.isAdminActive(deviceAdminComponent)) {
            val message = payload?.optString("message") ?: "Device locked by administrator"
            devicePolicyManager.lockNow()
            showSnackbar(message)
        } else {
            throw Exception("Device admin not active")
        }
    }
    
    // Server-initiated service restart (replaces user start/stop services)
    private suspend fun executeServerRestartServices() {
        try {
            mdmService.stopServices()
            delay(1000) // Brief pause between stop and start
            mdmService.startServices()
            updateStatus("MDM services restarted by administrator", StatusType.SUCCESS)
        } catch (e: Exception) {
            throw Exception("Failed to restart services: ${e.message}")
        }
    }

    // Server-initiated device unlock.
    //
    // This previously called lockNow() — the exact opposite of what it reported — and
    // then told the dashboard the device had been unlocked (finding F-10).
    //
    // Disabling the keyguard requires Device Owner privilege; isAdminActive() does not
    // imply it. Until the app is provisioned as Device Owner (finding F-07), this
    // reports an honest failure rather than silently doing nothing or the opposite.
    private suspend fun executeServerUnlockDevice(payload: org.json.JSONObject?) {
        if (!devicePolicyManager.isDeviceOwnerApp(packageName)) {
            throw Exception(
                "UNLOCK_DEVICE requires Device Owner privilege; this app is not the device owner"
            )
        }

        try {
            val disabled = devicePolicyManager.setKeyguardDisabled(deviceAdminComponent, true)
            if (!disabled) {
                throw Exception(
                    "The platform refused to disable the keyguard; a secure lock screen is set"
                )
            }
            updateStatus("Device keyguard disabled by administrator", StatusType.SUCCESS)
        } catch (e: SecurityException) {
            throw Exception("Not permitted to disable the keyguard: ${e.message}")
        }
    }

    // Server-initiated device info retrieval
    private suspend fun executeServerGetDeviceInfo() {
        try {
            val deviceInfo = mdmService.getDeviceInfo()
            updateStatus("Device info retrieved: $deviceInfo", StatusType.SUCCESS)
            showSnackbar("Device info: $deviceInfo")
        } catch (e: Exception) {
            throw Exception("Failed to get device info: ${e.message}")
        }
    }

    // Server-initiated device location request.
    //
    // This previously updated a status string and returned, collecting no location and
    // sending no result, while the dashboard recorded the command as executed
    // (finding F-10). It now resolves an actual fix and returns it as the command
    // result — so the caller must not send the generic result for this command.
    private suspend fun executeServerLocateDevice(
        payload: org.json.JSONObject?,
        commandId: String
    ) {
        val enableHighAccuracy = payload?.optBoolean("enableHighAccuracy") ?: false
        updateStatus("Locating device...", StatusType.INFO)

        try {
            val fix = com.mdm.app.utils.LocationResolver.resolve(
                context = this,
                highAccuracy = enableHighAccuracy
            )

            updateStatus(
                "Location reported: ${fix.latitude}, ${fix.longitude}",
                StatusType.SUCCESS
            )
            sendCommandResult(commandId, true, fix.toMap())
        } catch (e: Exception) {
            updateStatus("Unable to locate device: ${e.message}", StatusType.ERROR)
            sendCommandResult(commandId, false, null, e.message ?: "Location unavailable")
        }
    }

    // Server-initiated settings synchronization
    private suspend fun executeServerSyncSettings() {
        try {
            mdmService.updatePolicies()
            applyEnforcedPolicies()
            updateStatus("Settings synchronized by administrator", StatusType.SUCCESS)
            showSnackbar("Device settings synced")
        } catch (e: Exception) {
            throw Exception("Failed to sync settings: ${e.message}")
        }
    }

    // Over-the-Air (OTA) Device Provisioning
    private suspend fun executeProvisioning(payload: JSONObject?, commandId: String) {
        try {
            if (payload == null) {
                throw Exception("Provisioning payload is null")
            }

            updateStatus("Starting device provisioning...", StatusType.INFO)
            Log.d(TAG, "Provisioning payload: $payload")

            // Create and execute provisioning executor
            val executor = com.mdm.app.services.DeviceProvisioningExecutor(
                this,
                mdmService,
                preferenceManager
            )

            // Run provisioning in IO context
            executor.executeProvisioning(payload, commandId)

        } catch (e: Exception) {
            Log.e(TAG, "Provisioning failed", e)
            updateStatus("Provisioning failed: ${e.message}", StatusType.ERROR)
            sendCommandResult(commandId, false, null, "Provisioning failed: ${e.message}")
        }
    }

    // Server command handler - processes commands received via WebSocket
    private fun handleServerCommand(command: JSONObject) {
        val commandType = command.getString("commandType")
        val commandId = command.getString("commandId")
        val payload = command.optJSONObject("payload")

        Log.d(TAG, "handleServerCommand: type=$commandType, id=$commandId, payload=$payload")

        lifecycleScope.launch {
            try {
                when (commandType) {
                    // Support both uppercase (from backend) and lowercase (legacy) formats
                    "ENABLE_KIOSK", "enable_kiosk" -> executeServerKioskEnable(payload)
                    "DISABLE_KIOSK", "disable_kiosk" -> executeServerKioskDisable()
                    "LOCK_DEVICE", "lock_device" -> {
                        Log.d(TAG, "Executing LOCK_DEVICE command")
                        executeServerLockDevice(payload)
                    }
                    "UNLOCK_DEVICE", "unlock_device" -> {
                        Log.d(TAG, "Executing UNLOCK_DEVICE command")
                        executeServerUnlockDevice(payload)
                    }
                    "GET_DEVICE_INFO", "get_device_info" -> {
                        Log.d(TAG, "Executing GET_DEVICE_INFO command")
                        executeServerGetDeviceInfo()
                    }
                    "LOCATE_DEVICE", "locate_device" -> {
                        Log.d(TAG, "Executing LOCATE_DEVICE command")
                        // Sends its own result carrying the location fix.
                        executeServerLocateDevice(payload, commandId)
                        return@launch
                    }
                    "APPLY_POLICY", "apply_policy", "UPDATE_POLICY", "update_policy", "REMOVE_POLICY", "remove_policy" -> {
                        Log.d(TAG, "Executing POLICY modification command")
                        mdmService.updatePolicies()
                        applyEnforcedPolicies()
                    }
                    "SYNC_SETTINGS", "sync_settings" -> {
                        Log.d(TAG, "Executing SYNC_SETTINGS command")
                        executeServerSyncSettings()
                    }
                    "RESTART_SERVICES", "restart_services" -> executeServerRestartServices()
                    "PROVISION_DEVICE", "provision_device" -> {
                        Log.d(TAG, "Executing PROVISION_DEVICE command")
                        executeProvisioning(payload, commandId)
                        return@launch  // Don't send generic result, provisioning sends its own progress
                    }
                    else -> {
                        Log.w(TAG, "Unknown command type: $commandType")
                        sendCommandResult(commandId, false, null, "Unknown command type: $commandType")
                        return@launch
                    }
                }

                Log.d(TAG, "Command executed successfully, sending result")
                sendCommandResult(commandId, true, mapOf("executed" to true))

            } catch (e: Exception) {
                Log.e(TAG, "Command execution failed", e)
                sendCommandResult(commandId, false, null, e.message)
            }
        }
    }
    
    // Send command result back to server
    private fun sendCommandResult(commandId: String, success: Boolean, result: Any? = null, error: String? = null) {
        if (mdmService.isWebSocketConnected()) {
            val deviceId = PreferenceManager.getInstance(this).getDeviceId()
            val resultData = mapOf(
                "type" to "command_result",
                "deviceId" to deviceId,
                "commandId" to commandId,
                "success" to success,
                "result" to result,
                "error" to error,
                "timestamp" to System.currentTimeMillis()
            )
            mdmService.sendTestMessage(resultData)
        }
    }
    
    private fun checkPendingCommands() {
        showProgress(true)
        updateStatus("Checking for pending commands...", StatusType.INFO)
        
        lifecycleScope.launch {
            try {
                val commands = mdmService.checkPendingCommands()
                if (commands.isNotEmpty()) {
                    showCommandsDialog(commands)
                    updateStatus("Found ${commands.size} pending commands", StatusType.INFO)
                } else {
                    updateStatus("No pending commands", StatusType.SUCCESS)
                    showSnackbar("No pending commands")
                }
            } catch (e: Exception) {
                updateStatus("Failed to check commands: ${e.message}", StatusType.ERROR)
                showSnackbar("Failed to check commands: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Check commands error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    private fun updatePolicies() {
        showProgress(true)
        updateStatus("Updating policies...", StatusType.INFO)
        
        lifecycleScope.launch {
            try {
                val success = mdmService.updatePolicies()
                if (success) {
                    val applied = applyEnforcedPolicies()
                    if (applied) {
                        updateStatus("Policies enforced successfully", StatusType.SUCCESS)
                        showSnackbar("Policies updated and enforced!")
                    } else {
                        updateStatus("Policies fetched, but some enforcements failed", StatusType.ERROR)
                        showSnackbar("Policies fetched, but some enforcements failed")
                    }
                } else {
                    updateStatus("Failed to update policies from server", StatusType.ERROR)
                    showSnackbar("Failed to update policies", Snackbar.LENGTH_LONG)
                }
            } catch (e: Exception) {
                updateStatus("Policy update error: ${e.message}", StatusType.ERROR)
                showSnackbar("Policy update error: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Policy update error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    private suspend fun applyEnforcedPolicies(): Boolean {
        return try {
            val policyStrings = mdmService.getPolicies()
            val gson = Gson()
            val devicePolicies = mutableListOf<DevicePolicy>()
            
            for (policyStr in policyStrings) {
                try {
                    val pol = gson.fromJson(policyStr, DevicePolicy::class.java)
                    devicePolicies.add(pol)
                } catch(e: Exception) {
                    Log.e(TAG, "Failed to parse policy JSON", e)
                }
            }
            
            if (devicePolicies.isNotEmpty()) {
                val result = policyEngine.applyPolicies(devicePolicies)
                Log.i(TAG, "Policy engine applied ${devicePolicies.size} policies. Success: ${result.success}")
                result.success
            } else {
                Log.i(TAG, "No policies available to apply.")
                true
            }
        } catch(e: Exception) {
            Log.e(TAG, "Failed to apply policies", e)
            false
        }
    }
    
    private fun viewPolicies() {
        showProgress(true)
        updateStatus("Loading policies...", StatusType.INFO)
        
        lifecycleScope.launch {
            try {
                val policies = mdmService.getPolicies()
                showPoliciesDialog(policies)
                updateStatus("Policies loaded", StatusType.SUCCESS)
            } catch (e: Exception) {
                updateStatus("Failed to load policies: ${e.message}", StatusType.ERROR)
                showSnackbar("Failed to load policies: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Load policies error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    private fun requestApp() {
        // Launch AppRequestActivity for app request functionality
        try {
            val intent = Intent(this, com.mdm.app.AppRequestActivity::class.java)
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app request activity", e)
            showSnackbar("App request feature not available", Snackbar.LENGTH_LONG)
        }
    }

    private fun openStatus() {
        // Launch StatusActivity to display device status information (read-only)
        try {
            val intent = Intent(this, com.mdm.app.StatusActivity::class.java)
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch status activity", e)
            showSnackbar("Status not available", Snackbar.LENGTH_LONG)
        }
    }
    
    private fun getAppInventory() {
        showProgress(true)
        updateStatus("Getting app inventory...", StatusType.INFO)
        
        lifecycleScope.launch {
            try {
                val apps = mdmService.getAppInventory()
                showAppInventoryDialog(apps)
                updateStatus("App inventory collected", StatusType.SUCCESS)
            } catch (e: Exception) {
                updateStatus("Failed to get app inventory: ${e.message}", StatusType.ERROR)
                showSnackbar("Failed to get app inventory: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Get app inventory error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    private fun testInstall() {
        AlertDialog.Builder(this)
            .setTitle("Test Installation")
            .setMessage("This will simulate an app installation for testing purposes.")
            .setPositiveButton("Install Test App") { _, _ ->
                showProgress(true)
                updateStatus("Installing test app...", StatusType.INFO)
                
                lifecycleScope.launch {
                    try {
                        // Simulate installation delay
                        delay(2000)
                        
                        val testAppData = mapOf(
                            "type" to "app_install_test",
                            "appId" to "com.test.app",
                            "appName" to "Test App",
                            "version" to "1.0.0",
                            "status" to "installed",
                            "timestamp" to System.currentTimeMillis()
                        )
                        
                        // Send test installation message if WebSocket is connected
                        if (mdmService.isWebSocketConnected()) {
                            mdmService.sendTestMessage(testAppData)
                        }
                        
                        updateStatus("Test app installation completed", StatusType.SUCCESS)
                        showSnackbar("Test installation completed successfully!")
                        
                    } catch (e: Exception) {
                        updateStatus("Test installation failed: ${e.message}", StatusType.ERROR)
                        showSnackbar("Test installation failed: ${e.message}", Snackbar.LENGTH_LONG)
                        Log.e(TAG, "Test installation error", e)
                    } finally {
                        showProgress(false)
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun refreshDeviceStatus() {
        updateUI()
        updateHealthMetrics()
        showSnackbar("Status refreshed")
    }

    private fun updateHealthMetrics() {
        lifecycleScope.launch {
            try {
                val metrics = DeviceHealthMetrics.collect(this@MainActivity)

                // Update battery
                batteryPercentage.text = "${metrics.batteryLevel}%"
                batteryProgressBar.progress = metrics.batteryLevel
                chargingStatus.text = metrics.chargingStatus

                // Update storage
                storagePercentage.text = "${metrics.storageUsagePercent}% • ${metrics.storageString}"
                storageProgressBar.progress = metrics.storageUsagePercent

                // Update RAM
                ramPercentage.text = "${metrics.ramUsagePercent}% • ${metrics.ramString}"
                ramProgressBar.progress = metrics.ramUsagePercent

                Log.d(TAG, "Health metrics updated: Battery=${metrics.batteryLevel}%, Storage=${metrics.storageUsagePercent}%, RAM=${metrics.ramUsagePercent}%")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update health metrics", e)
            }
        }
    }
    
    private fun testConnection(serverUrl: String) {
        lifecycleScope.launch {
            try {
                updateStatus("Testing connection to $serverUrl...", StatusType.INFO)
                showProgress(true)
                
                // Try to reconnect WebSocket with new URL
                val deviceToken = preferenceManager.getDeviceToken()
                if (!deviceToken.isNullOrEmpty()) {
                    mdmService.reconnectWithNewUrl(serverUrl, deviceToken)
                    showSnackbar("Connection test initiated")
                } else {
                    showSnackbar("No device token available for connection test", Snackbar.LENGTH_LONG)
                }
                
            } catch (e: Exception) {
                updateStatus("Connection test failed: ${e.message}", StatusType.ERROR)
                showSnackbar("Connection test failed: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Connection test error", e)
            } finally {
                showProgress(false)
            }
        }
    }
    
    private fun updateWebSocketStatus(isConnected: Boolean) {
        val status = if (isConnected) "Connected" else "Disconnected"
        Log.d(TAG, "WebSocket status: $status")
        // WebSocket status will be reflected in the status indicator
    }
    
    private fun updateEnrollmentUI(isEnrolled: Boolean) {
        updateUI()
    }
    
    private fun displayDeviceInfo() {
        // This will be implemented to show device information in a card or dialog
    }
    
    private fun displayDeviceInfoDialog(deviceInfo: String) {
        AlertDialog.Builder(this)
            .setTitle("Device Information")
            .setMessage(deviceInfo)
            .setPositiveButton("OK", null)
            .show()
    }
    
    private fun showCommandsDialog(commands: List<String>) {
        val message = commands.joinToString("\n\n")
        AlertDialog.Builder(this)
            .setTitle("Pending Commands")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }
    
    private fun showPoliciesDialog(policies: List<String>) {
        val message = policies.joinToString("\n\n")
        AlertDialog.Builder(this)
            .setTitle("Device Policies")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }
    
    private fun showAppInventoryDialog(apps: List<String>) {
        val message = apps.joinToString("\n")
        AlertDialog.Builder(this)
            .setTitle("App Inventory")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        healthMetricsRefreshJob?.cancel()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        when (requestCode) {
            REQUEST_ENABLE_ADMIN -> {
                if (resultCode == RESULT_OK) {
                    showSnackbar("Device Admin enabled successfully!")
                    updateUI()
                } else {
                    showSnackbar("Device Admin not enabled", Snackbar.LENGTH_LONG)
                }
            }
        }
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == REQUEST_PERMISSIONS) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (allGranted) {
                showSnackbar("All permissions granted")
            } else {
                showSnackbar("Some permissions were denied", Snackbar.LENGTH_LONG)
            }
        }
    }
    
    private fun isRunningOnEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic") ||
                Build.FINGERPRINT.startsWith("unknown") ||
                Build.MODEL.contains("google_sdk") ||
                Build.MODEL.contains("Emulator") ||
                Build.MODEL.contains("Android SDK built for x86") ||
                Build.MANUFACTURER.contains("Genymotion") ||
                Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic") ||
                "google_sdk" == Build.PRODUCT)
    }
    
    enum class StatusType {
        SUCCESS, WARNING, ERROR, INFO
    }
}