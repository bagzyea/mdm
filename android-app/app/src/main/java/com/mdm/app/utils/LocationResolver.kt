package com.mdm.app.utils

import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import android.util.Log
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Resolves the device's current location for the LOCATE_DEVICE command.
 *
 * Previously `executeServerLocateDevice` updated a status string and returned without
 * collecting a location or sending a result, while the dashboard recorded the command
 * as executed (finding F-10). This collects an actual fix.
 *
 * Requests a fresh fix via `LocationManager.getCurrentLocation` (API 30+, and minSdk is
 * 30) and falls back to the best recent last-known fix if no fresh one arrives inside
 * the timeout — a tablet indoors in a field office may never get a GPS lock.
 */
object LocationResolver {

    private const val TAG = "LocationResolver"
    private const val DEFAULT_TIMEOUT_MS = 20_000L

    /** Executor the platform uses to deliver the location callback. */
    private val callbackExecutor: Executor = Executors.newSingleThreadExecutor()

    data class Fix(
        val latitude: Double,
        val longitude: Double,
        val accuracy: Float?,
        val altitude: Double?,
        val provider: String?,
        val timestamp: Long,
        val isFresh: Boolean
    ) {
        fun toMap(): Map<String, Any?> = mapOf(
            "latitude" to latitude,
            "longitude" to longitude,
            "accuracy" to accuracy,
            "altitude" to altitude,
            "provider" to provider,
            "timestamp" to timestamp,
            "isFresh" to isFresh
        )
    }

    class LocationUnavailableException(message: String) : Exception(message)

    private fun hasPermission(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val coarse = ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        return fine || coarse
    }

    /**
     * @param highAccuracy prefer the GPS provider over the network provider.
     * @throws LocationUnavailableException when permission is missing, location is
     *         switched off, or no fix could be obtained — so the command reports a
     *         genuine failure rather than a false success.
     */
    suspend fun resolve(
        context: Context,
        highAccuracy: Boolean = false,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS
    ): Fix {
        if (!hasPermission(context)) {
            throw LocationUnavailableException("Location permission not granted")
        }

        val locationManager =
            context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: throw LocationUnavailableException("Location service unavailable")

        if (!locationManager.isLocationEnabled) {
            throw LocationUnavailableException("Location is disabled on the device")
        }

        val provider = selectProvider(locationManager, highAccuracy)
            ?: throw LocationUnavailableException("No enabled location provider")

        val fresh = withTimeoutOrNull(timeoutMs) {
            requestCurrentLocation(locationManager, provider)
        }

        if (fresh != null) {
            return fresh.toFix(isFresh = true)
        }

        Log.w(TAG, "No fresh fix from $provider within ${timeoutMs}ms; falling back to last known")

        return bestLastKnown(locationManager)?.toFix(isFresh = false)
            ?: throw LocationUnavailableException("No location fix available")
    }

    private fun selectProvider(locationManager: LocationManager, highAccuracy: Boolean): String? {
        val preferred = if (highAccuracy) {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        } else {
            listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
        }

        return preferred.firstOrNull { provider ->
            runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)
        }
    }

    private suspend fun requestCurrentLocation(
        locationManager: LocationManager,
        provider: String
    ): Location? = suspendCancellableCoroutine { continuation ->
        val cancellationSignal = CancellationSignal()
        continuation.invokeOnCancellation { cancellationSignal.cancel() }

        try {
            locationManager.getCurrentLocation(
                provider,
                cancellationSignal,
                callbackExecutor,
            ) { location ->
                if (continuation.isActive) continuation.resume(location)
            }
        } catch (e: SecurityException) {
            if (continuation.isActive) continuation.resume(null)
        }
    }

    private fun bestLastKnown(locationManager: LocationManager): Location? {
        return try {
            locationManager.getProviders(true)
                .mapNotNull { provider ->
                    runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull()
                }
                .maxByOrNull { it.time }
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot read last known location", e)
            null
        }
    }

    private fun Location.toFix(isFresh: Boolean) = Fix(
        latitude = latitude,
        longitude = longitude,
        accuracy = if (hasAccuracy()) accuracy else null,
        altitude = if (hasAltitude()) altitude else null,
        provider = provider,
        timestamp = time,
        isFresh = isFresh
    )
}
