package com.mdm.app.websocket

import android.content.Context
import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import com.mdm.app.utils.PreferenceManager
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Callback interface so MainActivity (or any host) can receive server-originated commands
 * without tight coupling between WebSocketClient and Activity.
 */
interface CommandListener {
    fun onServerCommand(command: JSONObject)
}

class WebSocketClient private constructor(private val context: Context) {
    
    companion object {
        private const val TAG = "WebSocketClient"
        private const val CONNECTION_TIMEOUT = 30L
        private const val READ_TIMEOUT = 30L
        private const val WRITE_TIMEOUT = 30L
        private const val PING_INTERVAL = 30L
        
        @Volatile
        private var INSTANCE: WebSocketClient? = null
        
        fun getInstance(context: Context): WebSocketClient {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: WebSocketClient(context).also { INSTANCE = it }
            }
        }
    }
    
    private var webSocket: WebSocket? = null
    private var commandListener: CommandListener? = null

    /** Register the listener that will handle server-sent commands (e.g. MainActivity). */
    fun setCommandListener(listener: CommandListener?) {
        commandListener = listener
    }
    private var isConnecting = false
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 5
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(CONNECTION_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT, TimeUnit.SECONDS)
        .pingInterval(PING_INTERVAL, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()
    
    // LiveData for reactive UI updates
    private val _connectionStatus = MutableLiveData<Boolean>(false)
    val connectionStatus: LiveData<Boolean> = _connectionStatus
    
    private val _lastMessage = MutableLiveData<String>("")
    val lastMessage: LiveData<String> = _lastMessage
    
    private val _connectionError = MutableLiveData<String?>(null)
    val connectionError: LiveData<String?> = _connectionError
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    fun connect(serverUrl: String, deviceToken: String) {
        if (isConnecting || isConnected()) {
            Log.d(TAG, "Already connecting or connected")
            return
        }
        
        isConnecting = true
        _connectionError.postValue(null)
        
        try {
            // Clean and validate server URL
            val cleanServerUrl = serverUrl.trim().trimEnd('/')
            if (cleanServerUrl.isEmpty() || (!cleanServerUrl.startsWith("http://") && !cleanServerUrl.startsWith("https://"))) {
                throw IllegalArgumentException("Invalid server URL: $cleanServerUrl")
            }
            
            // Build WebSocket URL
            val wsUrl = cleanServerUrl.replace("http://", "ws://").replace("https://", "wss://") + "/ws?token=$deviceToken"
            Log.d(TAG, "Connecting to WebSocket: $wsUrl")
            
            val request = Request.Builder()
                .url(wsUrl)
                .addHeader("Authorization", "Bearer $deviceToken")
                .addHeader("User-Agent", "UBOS-MDM-Android")
                .addHeader("X-Device-Type", "android")
                .build()
            
            webSocket = client.newWebSocket(request, createWebSocketListener())
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create WebSocket connection", e)
            _connectionError.postValue("Connection failed: ${e.message}")
            isConnecting = false
            _connectionStatus.postValue(false)
        }
    }
    
    fun disconnect() {
        Log.d(TAG, "Disconnecting WebSocket")
        isConnecting = false
        webSocket?.close(1000, "Normal closure")
        webSocket = null
        _connectionStatus.postValue(false)
    }
    
    fun isConnected(): Boolean {
        return webSocket != null && _connectionStatus.value == true
    }
    
    fun sendMessage(message: Map<String, Any?>) {
        if (!isConnected()) {
            Log.w(TAG, "Cannot send message: WebSocket not connected")
            return
        }
        
        try {
            val jsonObj = JSONObject()
            message.forEach { (key, value) ->
                if (value == null) {
                    jsonObj.put(key, JSONObject.NULL)
                } else {
                    jsonObj.put(key, value)
                }
            }
            val jsonMessage = jsonObj.toString()
            Log.d(TAG, "Sending message: $jsonMessage")
            
            val success = webSocket?.send(jsonMessage) ?: false
            if (!success) {
                Log.e(TAG, "Failed to send message")
                _connectionError.postValue("Failed to send message")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message", e)
            _connectionError.postValue("Error sending message: ${e.message}")
        }
    }
    
    fun sendMessage(message: String) {
        if (!isConnected()) {
            Log.w(TAG, "Cannot send message: WebSocket not connected")
            return
        }
        
        try {
            Log.d(TAG, "Sending message: $message")
            
            val success = webSocket?.send(message) ?: false
            if (!success) {
                Log.e(TAG, "Failed to send message")
                _connectionError.postValue("Failed to send message")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message", e)
            _connectionError.postValue("Error sending message: ${e.message}")
        }
    }
    
    private fun createWebSocketListener(): WebSocketListener {
        return object : WebSocketListener() {
            
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connection opened")
                isConnecting = false
                reconnectAttempts = 0
                _connectionStatus.postValue(true)
                _connectionError.postValue(null)

                // Authenticate the device socket by sending deviceIdentify with token (Fix 1.2)
                val prefs = PreferenceManager.getInstance(context)
                val deviceId = prefs.getDeviceId()
                val token = prefs.getDeviceToken()
                if (!deviceId.isNullOrEmpty()) {
                    val identifyMsg = mapOf(
                        "type" to "deviceIdentify",
                        "deviceId" to deviceId,
                        "token" to (token ?: "")
                    )
                    sendMessage(identifyMsg)
                }
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: $text")
                _lastMessage.postValue(text)
                
                try {
                    handleIncomingMessage(text)
                } catch (e: Exception) {
                    Log.e(TAG, "Error handling incoming message", e)
                }
            }
            
            override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) {
                Log.d(TAG, "Received binary message: ${bytes.size} bytes")
                // Handle binary messages if needed
            }
            
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code - $reason")
                _connectionStatus.postValue(false)
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code - $reason")
                _connectionStatus.postValue(false)
                isConnecting = false
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                isConnecting = false
                _connectionStatus.postValue(false)
                _connectionError.postValue("Connection failed: ${t.message}")
                
                // Attempt reconnection if not manually disconnected
                if (reconnectAttempts < maxReconnectAttempts) {
                    scheduleReconnection()
                }
            }
        }
    }
    
    private fun handleIncomingMessage(message: String) {
        try {
            val json = JSONObject(message)
            val messageType = json.optString("type", "unknown")
            
            when (messageType) {
                "command" -> handleCommand(json)
                "policy_update" -> handlePolicyUpdate(json)
                "app_install" -> handleAppInstall(json)
                "app_uninstall" -> handleAppUninstall(json)
                "device_lock" -> handleDeviceLock(json)
                "device_wipe" -> handleDeviceWipe(json)
                "ping" -> handlePing(json)
                else -> Log.d(TAG, "Unknown message type: $messageType")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing incoming message", e)
        }
    }
    
    private fun handleCommand(json: JSONObject) {
        // Normalize both "executeCommand" (new shape) and legacy "command" (old shape)
        val commandId = json.optString("commandId", "")
        val commandType = json.optString("commandType",
            json.optString("command", ""))  // fall back to old "command" key
        val payload = json.optJSONObject("payload")
            ?: json.optJSONObject("parameters")  // fall back to old "parameters" key

        Log.d(TAG, "Command received: type=$commandType id=$commandId")

        // Acknowledge receipt
        val ackMessage = mapOf(
            "type" to "command_ack",
            "commandId" to commandId,
            "commandType" to commandType,
            "status" to "received",
            "timestamp" to System.currentTimeMillis()
        )
        sendMessage(ackMessage)

        // Build a normalized JSONObject and forward to the registered CommandListener
        val normalizedCommand = JSONObject().apply {
            put("commandId", commandId)
            put("commandType", commandType)
            if (payload != null) put("payload", payload)
        }

        dispatchToListener(normalizedCommand)
    }
    
    private fun handlePolicyUpdate(json: JSONObject) {
        val policyId = json.optString("policyId", "")
        val policyData = json.optString("policyData", "")
        
        Log.d(TAG, "Policy update received: $policyId")
        
        // Send policy update acknowledgment
        val ackMessage = mapOf(
            "type" to "policy_ack",
            "policyId" to policyId,
            "status" to "received",
            "timestamp" to System.currentTimeMillis()
        )
        sendMessage(ackMessage)
        
        // Apply policy (this would be handled by the policy engine)
        scope.launch {
            applyPolicy(policyId, policyData)
        }
    }
    
    private fun handleAppInstall(json: JSONObject) {
        val appId = json.optString("appId", "")
        val appUrl = json.optString("appUrl", "")
        
        Log.d(TAG, "App install command received: $appId")
        
        // Send app install acknowledgment
        val ackMessage = mapOf(
            "type" to "app_install_ack",
            "appId" to appId,
            "status" to "received",
            "timestamp" to System.currentTimeMillis()
        )
        sendMessage(ackMessage)
        
        // Install app (this would be handled by the app management service)
        scope.launch {
            installApp(appId, appUrl)
        }
    }
    
    private fun handleAppUninstall(json: JSONObject) {
        val appId = json.optString("appId", "")
        
        Log.d(TAG, "App uninstall command received: $appId")
        
        // Send app uninstall acknowledgment
        val ackMessage = mapOf(
            "type" to "app_uninstall_ack",
            "appId" to appId,
            "status" to "received",
            "timestamp" to System.currentTimeMillis()
        )
        sendMessage(ackMessage)
        
        // Uninstall app (this would be handled by the app management service)
        scope.launch {
            uninstallApp(appId)
        }
    }
    
    /**
     * Legacy message types "device_lock" and "device_wipe" are now routed through
     * the unified CommandListener dispatcher so all command execution lives in
     * MainActivity (Fix 1.1).
     */
    private fun handleDeviceLock(json: JSONObject) {
        Log.d(TAG, "Device lock command received (legacy message type)")
        val normalized = JSONObject().apply {
            put("commandId", json.optString("commandId", "legacy_lock_${System.currentTimeMillis()}"))
            put("commandType", "LOCK_DEVICE")
            if (json.has("payload")) put("payload", json.getJSONObject("payload"))
        }
        dispatchToListener(normalized)
    }

    private fun handleDeviceWipe(json: JSONObject) {
        Log.d(TAG, "Device wipe command received (legacy message type)")
        val normalized = JSONObject().apply {
            put("commandId", json.optString("commandId", "legacy_wipe_${System.currentTimeMillis()}"))
            put("commandType", "WIPE_DEVICE")
            if (json.has("payload")) put("payload", json.getJSONObject("payload"))
        }
        dispatchToListener(normalized)
    }

    /** Shared dispatcher — forwards a normalized command JSONObject to the registered listener. */
    private fun dispatchToListener(normalized: JSONObject) {
        val listener = commandListener
        if (listener != null) {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                listener.onServerCommand(normalized)
            }
        } else {
            Log.w(TAG, "No CommandListener registered — command will not be executed")
        }
    }
    
    private fun handlePing(json: JSONObject) {
        // Respond to ping with pong
        val pongMessage = mapOf(
            "type" to "pong",
            "timestamp" to System.currentTimeMillis()
        )
        sendMessage(pongMessage)
    }
    
    // Note: All command execution logic has been moved to MainActivity via the CommandListener
    // interface. WebSocketClient is now responsible only for transport — it receives commands
    // and delivers them to whoever is registered as the CommandListener.
    
    private fun scheduleReconnection() {
        scope.launch {
            reconnectAttempts++
            val delay = (reconnectAttempts * 1000L).coerceAtMost(10000L) // Max 10 seconds
            
            Log.d(TAG, "Scheduling reconnection attempt $reconnectAttempts in ${delay}ms")
            delay(delay)
            
            if (reconnectAttempts < maxReconnectAttempts) {
                val deviceToken = PreferenceManager.getInstance(context).getDeviceToken()
                val serverUrl = PreferenceManager.getInstance(context).getServerUrl()
                
                if (!deviceToken.isNullOrEmpty() && !serverUrl.isNullOrEmpty()) {
                    connect(serverUrl, deviceToken)
                }
            }
        }
    }
    
    fun onDestroy() {
        disconnect()
        scope.cancel()
    }
}