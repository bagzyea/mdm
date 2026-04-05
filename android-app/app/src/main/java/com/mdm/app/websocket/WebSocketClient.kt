package com.mdm.app.websocket

import android.content.Context
import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import com.mdm.app.utils.PreferenceManager
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URISyntaxException

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
        private const val RECONNECT_DELAY = 3000L // 3 seconds (more aggressive)
        private const val MAX_RECONNECT_ATTEMPTS = 20 // More attempts

        @Volatile
        private var INSTANCE: WebSocketClient? = null

        fun getInstance(context: Context): WebSocketClient {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: WebSocketClient(context).also { INSTANCE = it }
            }
        }
    }

    private var socket: Socket? = null
    private var commandListener: CommandListener? = null

    /** Register the listener that will handle server-sent commands (e.g. MainActivity). */
    fun setCommandListener(listener: CommandListener?) {
        commandListener = listener
    }

    private var isConnecting = false
    private var reconnectAttempts = 0

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

            Log.d(TAG, "Connecting to Socket.IO: $cleanServerUrl")

            // Configure Socket.IO client options
            val opts = IO.Options()
            opts.reconnection = true
            opts.reconnectionDelay = RECONNECT_DELAY
            opts.reconnectionAttempts = MAX_RECONNECT_ATTEMPTS
            opts.transports = arrayOf("websocket", "polling")
            opts.auth = mapOf(
                "token" to deviceToken,
                "deviceToken" to deviceToken
            )

            socket = IO.socket(cleanServerUrl, opts)

            // Set up event listeners
            socket!!.on(Socket.EVENT_CONNECT) { onConnect() }
            socket!!.on(Socket.EVENT_DISCONNECT) { onDisconnect() }
            socket!!.on(Socket.EVENT_CONNECT_ERROR) { args -> onConnectError(args) }
            socket!!.on("executeCommand") { args -> onExecuteCommand(args) }
            socket!!.on("authError") { args -> onAuthError(args) }

            // Connect
            socket!!.connect()

        } catch (e: URISyntaxException) {
            Log.e(TAG, "Invalid socket URL", e)
            _connectionError.postValue("Invalid server URL: ${e.message}")
            isConnecting = false
            _connectionStatus.postValue(false)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create WebSocket connection", e)
            _connectionError.postValue("Connection failed: ${e.message}")
            isConnecting = false
            _connectionStatus.postValue(false)
        }
    }

    private fun onConnect() {
        Log.d(TAG, "Socket.IO connected successfully")
        isConnecting = false
        reconnectAttempts = 0
        _connectionStatus.postValue(true)
        _connectionError.postValue(null)

        // Send device identification to the server
        val prefs = PreferenceManager.getInstance(context)
        val deviceId = prefs.getDeviceId()
        val token = prefs.getDeviceToken()

        Log.d(TAG, "onConnect: deviceId=$deviceId, hasToken=${!token.isNullOrEmpty()}")

        if (!deviceId.isNullOrEmpty()) {
            try {
                Log.d(TAG, "Emitting deviceIdentify event with deviceId: $deviceId and token")
                val identifyData = JSONObject().apply {
                    put("deviceId", deviceId)
                    put("token", token ?: "")
                }
                Log.d(TAG, "deviceIdentify payload: $identifyData")
                socket?.emit("deviceIdentify", identifyData)
                Log.d(TAG, "deviceIdentify event emitted successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to emit deviceIdentify event", e)
            }
        } else {
            Log.w(TAG, "Cannot send deviceIdentify: deviceId is empty")
        }
    }

    private fun onDisconnect() {
        Log.d(TAG, "Socket.IO disconnected")
        isConnecting = false
        _connectionStatus.postValue(false)
        scheduleReconnection()
    }

    private fun onConnectError(args: Array<*>) {
        val error = args.getOrNull(0)
        Log.e(TAG, "Socket.IO connection error: $error")
        isConnecting = false
        _connectionStatus.postValue(false)
        _connectionError.postValue("Connection error: $error")
        scheduleReconnection()
    }

    private fun onAuthError(args: Array<*>) {
        val error = args.getOrNull(0)
        Log.e(TAG, "Socket.IO authentication error: $error")
        _connectionError.postValue("Authentication error: $error")
    }

    private fun onExecuteCommand(args: Array<*>) {
        if (args.isEmpty()) {
            Log.w(TAG, "Received executeCommand with no data")
            return
        }

        try {
            val data = args[0]
            val commandJson = when (data) {
                is JSONObject -> data
                is String -> JSONObject(data)
                else -> JSONObject(data.toString())
            }

            Log.d(TAG, "Received command: $commandJson")
            _lastMessage.postValue(commandJson.toString())

            // Forward to registered listener
            val listener = commandListener
            if (listener != null) {
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    listener.onServerCommand(commandJson)
                }
            } else {
                Log.w(TAG, "No CommandListener registered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling executeCommand", e)
        }
    }

    fun disconnect() {
        Log.d(TAG, "Disconnecting Socket.IO")
        isConnecting = false
        socket?.disconnect()
        socket = null
        _connectionStatus.postValue(false)
    }

    fun isConnected(): Boolean {
        return socket?.connected() ?: false
    }

    fun sendMessage(message: Map<String, Any?>) {
        if (!isConnected()) {
            Log.w(TAG, "Cannot send message: Socket.IO not connected")
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

            socket?.emit("message", jsonMessage)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message", e)
            _connectionError.postValue("Error sending message: ${e.message}")
        }
    }

    fun sendMessage(message: String) {
        if (!isConnected()) {
            Log.w(TAG, "Cannot send message: Socket.IO not connected")
            return
        }

        try {
            Log.d(TAG, "Sending message: $message")
            socket?.emit("message", message)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message", e)
            _connectionError.postValue("Error sending message: ${e.message}")
        }
    }

    private fun scheduleReconnection() {
        scope.launch {
            reconnectAttempts++

            val delay = (reconnectAttempts * 5000L).coerceAtMost(60000L) // Exponential backoff, max 60 seconds

            Log.d(TAG, "Scheduling reconnection attempt $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS in ${delay}ms")
            delay(delay)

            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                val deviceToken = PreferenceManager.getInstance(context).getDeviceToken()

                // In debug builds, always use the local development server
                val serverUrl = if (context.packageName.endsWith(".debug")) {
                    Log.d(TAG, "Debug build: using emulator server URL for reconnection")
                    "http://10.0.2.2:5001"
                } else {
                    PreferenceManager.getInstance(context).getServerUrl()
                }

                if (!deviceToken.isNullOrEmpty() && !serverUrl.isNullOrEmpty()) {
                    Log.d(TAG, "Attempting reconnection $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS to $serverUrl")
                    connect(serverUrl, deviceToken)
                } else {
                    Log.w(TAG, "Cannot reconnect: missing device token or server URL")
                }
            } else {
                Log.e(TAG, "Max reconnection attempts ($MAX_RECONNECT_ATTEMPTS) reached")
                _connectionError.postValue("Failed to reconnect after $MAX_RECONNECT_ATTEMPTS attempts")
            }
        }
    }

    fun onDestroy() {
        disconnect()
        scope.cancel()
    }
}
