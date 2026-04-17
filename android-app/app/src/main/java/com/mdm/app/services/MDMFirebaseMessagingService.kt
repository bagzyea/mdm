package com.mdm.app.services

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.mdm.app.utils.PreferenceManager

class MDMFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "MDMFcmService"
    }

    /**
     * Called whenever a new FCM token is generated.
     * Must be sent to the backend to register the device for push notifications.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Token received: $token")
        
        // Save locally. In a full implementation, this implies firing off
        // an API request to the backend: POST /api/devices/{id}/fcm-token
        val preferenceManager = PreferenceManager.getInstance(applicationContext)
        preferenceManager.setDeviceToken(token) // Assuming this is where it's stored
    }

    /**
     * Called when a message is received while the app is in the foreground,
     * OR always called when a "data" payload message is received regardless of app state.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.i(TAG, "FCM Message Received from: ${remoteMessage.from}")

        // Check if message contains a data payload (a silent ping)
        if (remoteMessage.data.isNotEmpty()) {
            val action = remoteMessage.data["action"]
            Log.d(TAG, "Message data payload action: $action")

            if (action == "SYNC_REQUIRED" || action == "COMMAND_PENDING") {
                // The backend has dropped a command in the queue. Wake the app!
                Log.i(TAG, "Push-to-Wake triggered. Enqueueing immediate poll...")
                CommandPollingWorker.enqueueImmediatePoll(applicationContext)
            }
        }
    }
}
