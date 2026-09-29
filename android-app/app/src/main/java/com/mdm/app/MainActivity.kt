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
import com.mdm.app.services.MDMBackgroundService
import com.mdm.app.services.CommandExecutor
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
    private lateinit var statusIndicator: android.widget.ImageView
    private lateinit var statusDetailTextView: TextView
    private lateinit var statusCard: com.google.android.material.card.MaterialCardView
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

        // Commands are no longer handled here (finding F-09). MDMBackgroundService owns a
        // CommandExecutor, so lock, kiosk and policy commands run whether or not this
        // Activity exists. The Activity only lends the service the two operations that
        // genuinely require a resumed Activity — startLockTask and stopLockTask.
    }

    /**
     * Lend the foreground service the Activity-bound operations while we are resumed.
     *
     * `startLockTask()` is an Activity method the platform will only honour for a resumed
     * Activity; there is no service-side equivalent. Everything else the executor does
     * itself.
     */
    private val lockTaskActions = object : CommandExecutor.ActivityActions {
        override fun startLockTask(): Boolean = try {
            this@MainActivity.startLockTask()
            true
        } catch (e: Exception) {
            Log.e(TAG, "startLockTask failed", e)
            false
        }

        override fun stopLockTask(): Boolean = try {
            this@MainActivity.stopLockTask()
            true
        } catch (e: Exception) {
            Log.e(TAG, "stopLockTask failed", e)
            false
        }
    }

    override fun onResume() {
        super.onResume()
        MDMBackgroundService.commandExecutor()?.setActivityActions(lockTaskActions)
    }

    override fun onPause() {
        super.onPause()
        // The platform will not honour lock-task calls once we are not resumed, so the
        // executor must stop believing it can make them.
        MDMBackgroundService.commandExecutor()?.setActivityActions(null)
    }
    
    private fun setupUI() {
        // Initialize UI components
        statusIndicator = binding.statusIndicator
        statusTextView = binding.statusTextView
        statusDetailTextView = binding.statusDetailTextView
        statusCard = binding.statusCard
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
    
    /**
     * Show device state.
     *
     * State is expressed three ways at once — icon shape, plain-language text, and a
     * tinted container. It used to be a coloured circle and a terse line ("Checking
     * security..."), which is unreadable in direct sun and invisible to a colour-blind
     * enumerator: colour was the only signal.
     *
     * @param message the headline. Short, and about the device, not about the software.
     * @param detail what it means for the person holding the tablet, and what to do.
     */
    private fun updateStatus(
        message: String,
        type: StatusType = StatusType.INFO,
        detail: String? = null
    ) {
        runOnUiThread {
            statusTextView.text = message
            detail?.let { statusDetailTextView.text = it }
            applyStatusAppearance(type)
            Log.i(TAG, "Status: $message")
        }
    }

    private fun applyStatusAppearance(type: StatusType) {
        val (iconRes, containerColor, contentColor) = when (type) {
            StatusType.SUCCESS -> Triple(
                R.drawable.ic_status_ok, R.color.successContainer, R.color.onSuccessContainer
            )
            StatusType.WARNING -> Triple(
                R.drawable.ic_status_warning, R.color.warningContainer, R.color.onWarningContainer
            )
            StatusType.ERROR -> Triple(
                R.drawable.ic_status_error, R.color.errorContainer, R.color.onErrorContainer
            )
            StatusType.INFO -> Triple(
                R.drawable.ic_status_syncing, R.color.neutralContainer, R.color.onNeutralContainer
            )
        }

        val content = ContextCompat.getColor(this, contentColor)

        statusIndicator.setImageResource(iconRes)
        statusIndicator.imageTintList = android.content.res.ColorStateList.valueOf(content)
        statusCard.setCardBackgroundColor(ContextCompat.getColor(this, containerColor))
        statusTextView.setTextColor(content)
        statusDetailTextView.setTextColor(content)
    }

    private fun updateStatusIndicator(isConnected: Boolean) {
        if (isConnected) {
            updateStatus(
                getString(R.string.status_ready),
                StatusType.SUCCESS,
                getString(R.string.status_ready_detail)
            )
        } else {
            // Offline is normal in the field, not a fault: an enumerator out of coverage
            // has done nothing wrong and should not be shown an error.
            updateStatus(
                getString(R.string.status_offline),
                StatusType.WARNING,
                getString(R.string.status_offline_detail)
            )
        }
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
    
    /**
     * Enrollment needs a single-use code an administrator generates in the dashboard
     * (Devices -> Enroll Device -> Generate enrollment code). Nothing in the app used to
     * ask for it — it read a stored code that nothing ever stored — so no tablet could
     * enroll. It is now asked for here, and discarded after an attempt, since a code
     * works once.
     */
    private fun enrollDevice() {
        val saved = preferenceManager.getEnrollmentCode()
        if (saved.isNullOrBlank()) {
            promptForEnrollmentCode()
        } else {
            enrollWithCode(saved)
        }
    }

    private fun promptForEnrollmentCode() {
        val padding = (20 * resources.displayMetrics.density).toInt()
        val input = android.widget.EditText(this).apply {
            hint = "XXXX-XXXX-XXXX"
            isSingleLine = true
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        }
        val container = android.widget.FrameLayout(this).apply {
            setPadding(padding, padding / 2, padding, 0)
            addView(input)
        }

        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("Enrollment code")
            .setMessage("Enter the code from the MDM dashboard (Devices \u2192 Enroll Device \u2192 Generate enrollment code).")
            .setView(container)
            .setPositiveButton("Enroll") { _, _ ->
                val code = input.text.toString().trim().uppercase()
                if (code.isEmpty()) {
                    showSnackbar("An enrollment code is required", Snackbar.LENGTH_LONG)
                } else {
                    preferenceManager.setEnrollmentCode(code)
                    enrollWithCode(code)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun enrollWithCode(enrollmentCode: String) {
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
                    showSnackbar("Enrollment failed. Check the code, or ask for a new one.", Snackbar.LENGTH_LONG)
                }
            } catch (e: Exception) {
                updateStatus("Enrollment error: ${e.message}", StatusType.ERROR)
                showSnackbar("Enrollment error: ${e.message}", Snackbar.LENGTH_LONG)
                Log.e(TAG, "Enrollment error", e)
            } finally {
                // Codes are single-use: never retry a spent or rejected one silently.
                preferenceManager.setEnrollmentCode("")
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
    // Server command execution lives in MDMBackgroundService via CommandExecutor
    // (finding F-09). It used to live here, which meant lock, kiosk and policy
    // commands only ran while this Activity was foregrounded — on a census tablet
    // that is almost never. This Activity now only lends the executor startLockTask
    // and stopLockTask, which the platform will not honour from a service.
    
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