package com.mdm.app.services

import android.content.Context
import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import com.mdm.app.api.ApiClient
import com.mdm.app.api.MDMApiService
import com.mdm.app.models.DeviceInfo
import com.mdm.app.models.EnrollmentRequest
import com.mdm.app.models.EnrollmentResponse
import com.mdm.app.utils.PreferenceManager
import com.mdm.app.websocket.CommandListener
import com.mdm.app.websocket.WebSocketClient
import kotlinx.coroutines.*
import java.util.*

class MDMService(private val context: Context) {
    
    companion object {
        private const val TAG = "MDMService"
        private const val HEARTBEAT_INTERVAL = 5 * 60 * 1000L // 5 minutes
        private const val RECONNECTION_DELAY = 5000L // 5 seconds
        private const val MAX_RECONNECTION_ATTEMPTS = 5
    }
    
    private val apiService: MDMApiService = ApiClient.getInstance(context).mdmApiService
    private val webSocketClient: WebSocketClient = WebSocketClient.getInstance(context)
    private val preferenceManager: PreferenceManager = PreferenceManager.getInstance(context)
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    private var reconnectionJob: Job? = null
    
    // LiveData for reactive UI updates
    private val _connectionStatus = MutableLiveData<Boolean>(false)
    val connectionStatus: LiveData<Boolean> = _connectionStatus
    
    private val _enrollmentStatus = MutableLiveData<Boolean>(false)
    val enrollmentStatus: LiveData<Boolean> = _enrollmentStatus
    
    private val _deviceStatus = MutableLiveData<String>("Unknown")
    val deviceStatus: LiveData<String> = _deviceStatus
    
    private val _lastSyncTime = MutableLiveData<Date>()
    val lastSyncTime: LiveData<Date> = _lastSyncTime
    
    init {
        initializeService()
        observeWebSocketStatus()
    }
    
    private fun initializeService() {
        // Check if device is already enrolled
        val deviceToken = preferenceManager.getDeviceToken()
        if (!deviceToken.isNullOrEmpty()) {
            _enrollmentStatus.value = true
            startHeartbeat()
        }
        
        // Initialize WebSocket connection
        initializeWebSocket()
    }
    
    private fun observeWebSocketStatus() {
        webSocketClient.connectionStatus.observeForever { isConnected ->
            _connectionStatus.postValue(isConnected)
            if (isConnected) {
                _deviceStatus.postValue("Connected")
                startHeartbeat()
            } else {
                _deviceStatus.postValue("Disconnected")
                stopHeartbeat()
                scheduleReconnection()
            }
        }
    }
    
    private fun initializeWebSocket() {
        val serverUrl = preferenceManager.getServerUrl()
        val deviceToken = preferenceManager.getDeviceToken()
        
        if (!serverUrl.isNullOrEmpty() && !deviceToken.isNullOrEmpty()) {
            webSocketClient.connect(serverUrl, deviceToken)
        } else {
            Log.w(TAG, "Cannot initialize WebSocket: missing server URL or device token")
            if (serverUrl.isNullOrEmpty()) {
                Log.w(TAG, "Server URL is empty, using fallback URL")
                // Try with fallback server URL for emulator
                val fallbackUrl = "http://10.0.2.2:5000"
                if (!deviceToken.isNullOrEmpty()) {
                    webSocketClient.connect(fallbackUrl, deviceToken)
                }
            }
        }
    }
    
    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                try {
                    sendHeartbeat()
                    delay(HEARTBEAT_INTERVAL)
                } catch (e: Exception) {
                    Log.e(TAG, "Heartbeat error", e)
                    break
                }
            }
        }
    }
    
    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }
    
    private suspend fun sendHeartbeat() {
        scope.launch {
            try {
                val deviceInfo = collectDeviceInfo()
                val heartbeatData = mapOf(
                    "type" to "heartbeat",
                    "deviceId" to deviceInfo.deviceId,
                    "timestamp" to System.currentTimeMillis(),
                    "batteryLevel" to deviceInfo.batteryLevel,
                    "isCharging" to deviceInfo.isCharging,
                    "location" to deviceInfo.location,
                    "status" to "active"
                )
                
                webSocketClient.sendMessage(heartbeatData)
                _lastSyncTime.postValue(Date())
                Log.d(TAG, "Heartbeat sent successfully")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send heartbeat", e)
            }
        }
    }
    
    private fun scheduleReconnection() {
        reconnectionJob?.cancel()
        reconnectionJob = scope.launch {
            var attempts = 0
            while (attempts < MAX_RECONNECTION_ATTEMPTS && !webSocketClient.isConnected()) {
                delay(RECONNECTION_DELAY * (attempts + 1))
                attempts++
                
                try {
                    Log.d(TAG, "Attempting reconnection $attempts/$MAX_RECONNECTION_ATTEMPTS")
                    initializeWebSocket()
                    
                    if (webSocketClient.isConnected()) {
                        Log.d(TAG, "Reconnection successful")
                        break
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Reconnection attempt $attempts failed", e)
                }
            }
            
            if (!webSocketClient.isConnected()) {
                Log.e(TAG, "Failed to reconnect after $MAX_RECONNECTION_ATTEMPTS attempts")
                _deviceStatus.postValue("Connection Failed")
            }
        }
    }
    
    suspend fun enrollDevice(enrollmentCode: String): Boolean {
        return try {
            val deviceInfo = collectDeviceInfo()
            
            val enrollmentRequest = EnrollmentRequest(
                deviceInfo = deviceInfo,
                enrollmentCode = enrollmentCode,
                organizationId = null
            )
            
            val response = apiService.enrollDevice(enrollmentRequest)
            if (response.isSuccessful) {
                val body: EnrollmentResponse? = response.body()
                if (body?.success == true) {
                    body.deviceToken?.let { preferenceManager.setDeviceToken(it) }
                    body.deviceId?.let { preferenceManager.setDeviceId(it) }
                    _enrollmentStatus.postValue(true)
                    initializeWebSocket()
                    Log.d(TAG, "Device enrolled successfully")
                    true
                } else {
                    Log.e(TAG, "Enrollment failed: ${body?.message}")
                    false
                }
            } else {
                Log.e(TAG, "Enrollment HTTP error: ${response.code()}")
                false
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Enrollment error", e)
            false
        }
    }
    
    fun isDeviceEnrolled(): Boolean {
        val deviceToken = preferenceManager.getDeviceToken()
        val isEnrolled = !deviceToken.isNullOrEmpty()
        _enrollmentStatus.postValue(isEnrolled)
        return isEnrolled
    }
    
    fun isWebSocketConnected(): Boolean {
        return webSocketClient.isConnected()
    }
    
    suspend fun startServices(): Boolean {
        return try {
            initializeWebSocket()
            startHeartbeat()
            val startData = mapOf(
                "type" to "service_start",
                "deviceId" to preferenceManager.getDeviceId(),
                "timestamp" to System.currentTimeMillis()
            )
            webSocketClient.sendMessage(startData)
            _deviceStatus.postValue("Services Started")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start services", e)
            false
        }
    }
    
    suspend fun stopServices(): Boolean {
        return try {
            stopHeartbeat()
            val stopData = mapOf(
                "type" to "service_stop",
                "deviceId" to preferenceManager.getDeviceId(),
                "timestamp" to System.currentTimeMillis()
            )
            webSocketClient.sendMessage(stopData)
            webSocketClient.disconnect()
            _deviceStatus.postValue("Services Stopped")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop services", e)
            false
        }
    }
    
    suspend fun getDeviceInfo(): String {
        return try {
            val deviceInfo = collectDeviceInfo()
            deviceInfo.toString()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get device info", e)
            "Error collecting device information: ${e.message}"
        }
    }
    
    suspend fun checkPendingCommands(): List<String> {
        return try {
            val deviceId = preferenceManager.getDeviceId()
            if (deviceId.isNullOrEmpty()) {
                return emptyList()
            }
            val response = apiService.getPendingCommands(deviceId)
            if (response.isSuccessful) {
                response.body()?.map { it.toString() } ?: emptyList()
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check pending commands", e)
            emptyList()
        }
    }
    
    suspend fun updatePolicies(): Boolean {
        return try {
            val deviceId = preferenceManager.getDeviceId()
            if (deviceId.isNullOrEmpty()) {
                return false
            }
            val response = apiService.getDevicePolicies(deviceId)
            if (response.isSuccessful) {
                val policies = response.body() ?: emptyList()
                preferenceManager.setPolicies(policies.map { it.toString() })
                Log.d(TAG, "Policies updated successfully")
                true
            } else {
                Log.e(TAG, "Failed to update policies")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update policies", e)
            false
        }
    }
    
    suspend fun getPolicies(): List<String> {
        return try {
            val storedPolicies = preferenceManager.getPolicies()
            if (storedPolicies.isNotEmpty()) {
                return storedPolicies
            }
            val deviceId = preferenceManager.getDeviceId()
            if (deviceId.isNullOrEmpty()) {
                return emptyList()
            }
            val response = apiService.getDevicePolicies(deviceId)
            if (response.isSuccessful) {
                response.body()?.map { it.toString() } ?: emptyList()
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get policies", e)
            emptyList()
        }
    }
    
    suspend fun getAppInventory(): List<String> {
        return try {
            // For now, return locally stored inventory or empty
            preferenceManager.getAppInventory()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get app inventory", e)
            emptyList()
        }
    }
    
    private suspend fun collectDeviceInfo(): DeviceInfo {
        return DeviceInfo(
            deviceId = preferenceManager.getDeviceId() ?: generateDeviceId(),
            manufacturer = android.os.Build.MANUFACTURER,
            model = android.os.Build.MODEL,
            osVersion = android.os.Build.VERSION.RELEASE,
            apiLevel = android.os.Build.VERSION.SDK_INT,
            batteryLevel = 100,
            isCharging = false,
            location = null,
            storageTotal = 0L,
            storageUsed = 0L,
            ramTotal = 0L,
            ramUsed = 0L
        )
    }
    
    private fun generateDeviceId(): String {
        val deviceId = preferenceManager.getDeviceId()
        if (!deviceId.isNullOrEmpty()) {
            return deviceId
        }
        val newDeviceId = "DEV_${System.currentTimeMillis()}_${Random().nextInt(10000)}"
        preferenceManager.setDeviceId(newDeviceId)
        return newDeviceId
    }
    
    // Admin callbacks (no-op implementations for now)
    fun onDeviceAdminEnabled() {
        Log.i(TAG, "Device admin enabled")
    }
    
    fun onDeviceAdminDisabled() {
        Log.w(TAG, "Device admin disabled")
    }
    
    fun notifyPasswordChanged() {
        Log.i(TAG, "Password changed")
    }
    
    fun notifyPasswordFailed() {
        Log.w(TAG, "Password attempt failed")
    }
    
    fun resetFailedPasswordAttempts() {
        Log.i(TAG, "Resetting failed password attempts")
    }
    
    fun notifyProvisioningComplete() {
        Log.i(TAG, "Provisioning complete")
    }
    
    /** Allow the host Activity to register itself as the command listener. */
    fun setCommandListener(listener: CommandListener?) {
        webSocketClient.setCommandListener(listener)
    }

    fun sendTestMessage(data: Map<String, Any?>) {
        webSocketClient.sendMessage(data)
    }
    
    fun reconnectWithNewUrl(serverUrl: String, deviceToken: String) {
        webSocketClient.disconnect()
        scope.launch {
            delay(1000) // Wait a moment before reconnecting
            webSocketClient.connect(serverUrl, deviceToken)
        }
    }
    
    fun onDestroy() {
        heartbeatJob?.cancel()
        reconnectionJob?.cancel()
        scope.cancel()
        webSocketClient.disconnect()
    }
}