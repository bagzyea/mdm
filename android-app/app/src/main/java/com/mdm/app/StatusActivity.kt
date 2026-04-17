package com.mdm.app

import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.card.MaterialCardView
import com.google.android.material.snackbar.Snackbar
import com.mdm.app.api.ApiClient
import com.mdm.app.databinding.ActivityStatusBinding
import com.mdm.app.utils.PreferenceManager
import java.text.SimpleDateFormat
import java.util.*

/**
 * Status Activity - Display read-only device and MDM information
 *
 * This activity provides transparency to users about their device's enrollment
 * and status WITHOUT allowing any user modifications. All configuration is
 * controlled by the MDM administrator via the dashboard.
 *
 * Purpose: User Awareness Only
 * - Show enrollment status
 * - Display device information
 * - Show last sync time
 * - Display compliance status
 * - Show MDM server endpoint (read-only)
 */
class StatusActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "StatusActivity"
    }

    private lateinit var binding: ActivityStatusBinding
    private lateinit var preferenceManager: PreferenceManager
    private lateinit var apiClient: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityStatusBinding.inflate(layoutInflater)
        setContentView(binding.root)

        preferenceManager = PreferenceManager.getInstance(this)
        apiClient = ApiClient.getInstance(this)

        setupUI()
        loadStatus()
    }

    private fun setupUI() {
        val toolbar: MaterialToolbar = binding.toolbar
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
    }

    private fun loadStatus() {
        try {
            // Enrollment Information
            val deviceId = preferenceManager.getDeviceId() ?: "Not available"
            val isEnrolled = preferenceManager.isDeviceEnrolled()
            val enrollmentStatus = if (isEnrolled) "✓ Enrolled" else "✗ Not enrolled"
            val organizationId = preferenceManager.getOrganizationId() ?: "N/A"

            binding.deviceIdValue.text = deviceId
            binding.enrollmentStatusValue.text = enrollmentStatus
            binding.organizationIdValue.text = organizationId

            // Device Information (read-only)
            binding.deviceNameValue.text = android.os.Build.MODEL
            binding.androidVersionValue.text = "Android ${android.os.Build.VERSION.RELEASE}"
            binding.appVersionValue.text = "1.0.0"  // TODO: Get from BuildConfig

            // MDM Server Information (read-only, no edits allowed)
            val serverUrl = apiClient.getServerUrl()
            binding.mdmServerValue.text = serverUrl

            // Last Sync Information
            val lastHeartbeat = preferenceManager.getLastHeartbeat()
            if (lastHeartbeat > 0) {
                val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
                val lastSyncDate = dateFormat.format(Date(lastHeartbeat))
                binding.lastSyncValue.text = lastSyncDate

                // Calculate time since last sync
                val timeSinceSyncMs = System.currentTimeMillis() - lastHeartbeat
                val timeSinceSyncMins = timeSinceSyncMs / (1000 * 60)
                if (timeSinceSyncMins < 1) {
                    binding.syncStatusValue.text = "Connected"
                    binding.syncStatusValue.setTextColor(getColor(R.color.statusOnline))
                } else if (timeSinceSyncMins < 60) {
                    binding.syncStatusValue.text = "Synced ${timeSinceSyncMins}m ago"
                    binding.syncStatusValue.setTextColor(getColor(R.color.statusOnline))
                } else {
                    val timeSinceSyncHours = timeSinceSyncMins / 60
                    binding.syncStatusValue.text = "Synced ${timeSinceSyncHours}h ago"
                    binding.syncStatusValue.setTextColor(getColor(R.color.statusWarning))
                }
            } else {
                binding.lastSyncValue.text = "Never"
                binding.syncStatusValue.text = "Not synced yet"
                binding.syncStatusValue.setTextColor(getColor(R.color.statusWarning))
            }

            // Compliance Status (read-only)
            // TODO: Load from policy engine once implemented
            binding.complianceStatusValue.text = "Compliant"
            binding.complianceStatusValue.setTextColor(getColor(R.color.statusOnline))

            Log.d(TAG, "Status loaded successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load status", e)
            Snackbar.make(binding.root, "Failed to load status: ${e.message}", Snackbar.LENGTH_LONG).show()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
