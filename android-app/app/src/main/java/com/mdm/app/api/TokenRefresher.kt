package com.mdm.app.api

import android.util.Log
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/** Where the agent keeps its credentials. Implemented by PreferenceManager. */
interface TokenStore {
    fun getDeviceToken(): String?
    fun setDeviceToken(token: String)
    fun getRefreshToken(): String?
}

/**
 * Exchanges the stored refresh token for a new access token.
 *
 * Enrollment issues a short-lived access token plus a long-lived refresh token (findings
 * F-02 / F-13). The agent used to keep only the access token and had no way to renew it,
 * so an hour after enrolling every HTTP call and every socket handshake was refused, for
 * good. This is the one place that renews it; the HTTP client and the socket both call it.
 */
class TokenRefresher(
    private val store: TokenStore,
    private val refreshUrl: String,
    private val httpClient: OkHttpClient
) {
    enum class Outcome {
        /** A new access token is stored. */
        REFRESHED,
        /** The server refused the refresh token: the device was revoked, or never had one. */
        REVOKED,
        /** Network or server trouble; try again later. */
        FAILED
    }

    private val lock = Any()

    /**
     * @param staleToken the access token the caller saw rejected. When several requests
     *        fail at once, only the first refreshes; the rest see the token has already
     *        changed and reuse the new one.
     */
    fun refresh(staleToken: String?): Outcome {
        synchronized(lock) {
            val current = store.getDeviceToken()
            if (!current.isNullOrEmpty() && current != staleToken) return Outcome.REFRESHED

            val refreshToken = store.getRefreshToken()
            if (refreshToken.isNullOrEmpty()) return Outcome.REVOKED

            val payload = JsonObject().apply { addProperty("refreshToken", refreshToken) }
            val request = Request.Builder()
                .url(refreshUrl)
                .post(payload.toString().toRequestBody(JSON))
                .build()

            return try {
                httpClient.newCall(request).execute().use { response ->
                    val token = response.body?.string()?.let(::parseDeviceToken)
                    when {
                        response.isSuccessful && !token.isNullOrEmpty() -> {
                            store.setDeviceToken(token)
                            Outcome.REFRESHED
                        }
                        response.code == 401 || response.code == 403 -> Outcome.REVOKED
                        else -> Outcome.FAILED
                    }
                }
            } catch (e: IOException) {
                Log.w(TAG, "Token refresh failed", e)
                Outcome.FAILED
            }
        }
    }

    private fun parseDeviceToken(body: String): String? = try {
        JsonParser.parseString(body).asJsonObject.get("deviceToken")?.takeIf { !it.isJsonNull }?.asString
    } catch (e: Exception) {
        null
    }

    private companion object {
        const val TAG = "TokenRefresher"
        val JSON = "application/json".toMediaType()
    }
}
