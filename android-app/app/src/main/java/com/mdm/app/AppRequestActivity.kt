package com.mdm.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.LayoutInflater
import android.widget.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.mdm.app.models.AppRequest
import com.mdm.app.models.AppRequestPriority
import com.mdm.app.models.AppRequestStatus
import com.mdm.app.services.AppManagementService
import com.mdm.app.utils.PreferenceManager
import kotlinx.coroutines.*

/**
 * Activity for users to request applications to be installed on their devices
 */
class AppRequestActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "AppRequestActivity"
        
        fun start(context: Context) {
            val intent = Intent(context, AppRequestActivity::class.java)
            context.startActivity(intent)
        }
    }
    
    private lateinit var appNameInput: EditText
    private lateinit var packageNameInput: EditText
    private lateinit var reasonInput: EditText
    private lateinit var prioritySpinner: Spinner
    private lateinit var submitButton: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView
    private lateinit var requestsRecyclerView: RecyclerView
    private lateinit var noRequestsText: TextView
    
    private val appManagementService = AppManagementService(this)
    private val preferenceManager = PreferenceManager.getInstance(this)
    private val coroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    private val requests = mutableListOf<AppRequest>()
    private lateinit var requestsAdapter: AppRequestsAdapter
    
    private val priorities = arrayOf(
        AppRequestPriority.LOW,
        AppRequestPriority.NORMAL,
        AppRequestPriority.HIGH,
        AppRequestPriority.URGENT
    )
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_app_request)
        
        initializeViews()
        setupPrioritySpinner()
        setupRecyclerView()
        loadExistingRequests()
        
        submitButton.setOnClickListener {
            submitAppRequest()
        }
    }
    
    private fun initializeViews() {
        appNameInput = findViewById(R.id.appNameInput)
        packageNameInput = findViewById(R.id.packageNameInput)
        reasonInput = findViewById(R.id.reasonInput)
        prioritySpinner = findViewById(R.id.prioritySpinner)
        submitButton = findViewById(R.id.submitButton)
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)
        requestsRecyclerView = findViewById(R.id.requestsRecyclerView)
        noRequestsText = findViewById(R.id.noRequestsText)
    }
    
    private fun setupPrioritySpinner() {
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, priorities.map { it.name })
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        prioritySpinner.adapter = adapter
        prioritySpinner.setSelection(1) // Default to NORMAL
    }
    
    private fun setupRecyclerView() {
        requestsAdapter = AppRequestsAdapter(requests) { request ->
            // Handle request item click
            showRequestDetails(request)
        }
        
        requestsRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@AppRequestActivity)
            adapter = requestsAdapter
        }
    }
    
    private fun loadExistingRequests() {
        // TODO: Load existing requests from server or local storage
        // For now, show empty state
        updateRequestsUI()
    }
    
    private fun submitAppRequest() {
        val appName = appNameInput.text.toString().trim()
        val packageName = packageNameInput.text.toString().trim()
        val reason = reasonInput.text.toString().trim()
        val priority = prioritySpinner.selectedItem.toString()
        
        // Validate input
        if (appName.isEmpty()) {
            appNameInput.error = getString(R.string.app_request_app_name_hint)
            return
        }
        
        if (reason.isEmpty()) {
            reasonInput.error = getString(R.string.app_request_reason_hint)
            return
        }
        
        // Check if device is enrolled
        if (!preferenceManager.isDeviceEnrolled()) {
            showError(getString(R.string.app_request_device_not_enrolled))
            return
        }
        
        // Submit request
        coroutineScope.launch {
            try {
                showProgress(true)
                
                val priorityEnum = priorities[prioritySpinner.selectedItemPosition]
                val result = appManagementService.submitAppRequest(
                    appName = appName,
                    packageName = if (packageName.isNotEmpty()) packageName else null,
                    reason = reason,
                    priority = priorityEnum
                )
                
                if (result.success) {
                    showSuccess(getString(R.string.app_request_success))
                    clearForm()
                    
                    // Add to local list
                    val newRequest = AppRequest(
                        id = result.requestId ?: "local_${System.currentTimeMillis()}",
                        userId = preferenceManager.getUserId() ?: "unknown",
                        deviceId = preferenceManager.getDeviceId() ?: "unknown",
                        appPackageName = if (packageName.isNotEmpty()) packageName else null,
                        appName = appName,
                        requestReason = reason,
                        priority = priorityEnum,
                        status = AppRequestStatus.PENDING,
                        requestedAt = System.currentTimeMillis()
                    )
                    
                    requests.add(0, newRequest)
                    updateRequestsUI()
                    
                } else {
                    showError(getString(R.string.app_request_error, result.error))
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error submitting app request", e)
                showError(getString(R.string.app_request_error_generic, e.message))
            } finally {
                showProgress(false)
            }
        }
    }
    
    private fun clearForm() {
        appNameInput.text.clear()
        packageNameInput.text.clear()
        reasonInput.text.clear()
        prioritySpinner.setSelection(1)
    }
    
    private fun showProgress(show: Boolean) {
        progressBar.visibility = if (show) View.VISIBLE else View.GONE
        submitButton.isEnabled = !show
    }
    
    private fun showSuccess(message: String) {
        statusText.text = message
        statusText.setTextColor(getColor(android.R.color.holo_green_dark))
        statusText.visibility = View.VISIBLE
        
        // Hide after 3 seconds
        coroutineScope.launch {
            delay(3000)
            statusText.visibility = View.GONE
        }
    }
    
    private fun showError(message: String) {
        statusText.text = message
        statusText.setTextColor(getColor(android.R.color.holo_red_dark))
        statusText.visibility = View.VISIBLE
        
        // Hide after 5 seconds
        coroutineScope.launch {
            delay(5000)
            statusText.visibility = View.GONE
        }
    }
    
    private fun updateRequestsUI() {
        if (requests.isEmpty()) {
            noRequestsText.visibility = View.VISIBLE
            requestsRecyclerView.visibility = View.GONE
        } else {
            noRequestsText.visibility = View.GONE
            requestsRecyclerView.visibility = View.VISIBLE
            requestsAdapter.notifyDataSetChanged()
        }
    }
    
    private fun showRequestDetails(request: AppRequest) {
        // TODO: Show detailed view of the request
        Toast.makeText(this, "Request: ${request.appName}", Toast.LENGTH_SHORT).show()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        coroutineScope.cancel()
    }
}

/**
 * Adapter for displaying app requests
 */
class AppRequestsAdapter(
    private val requests: List<AppRequest>,
    private val onItemClick: (AppRequest) -> Unit
) : RecyclerView.Adapter<AppRequestsAdapter.ViewHolder>() {
    
    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val appNameText: TextView = view.findViewById(R.id.appNameText)
        val reasonText: TextView = view.findViewById(R.id.reasonText)
        val priorityText: TextView = view.findViewById(R.id.priorityText)
        val statusText: TextView = view.findViewById(R.id.statusText)
        val dateText: TextView = view.findViewById(R.id.dateText)
        val rootView: View = view
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app_request, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val request = requests[position]
        
        holder.appNameText.text = request.appName
        holder.reasonText.text = request.requestReason
        holder.priorityText.text = request.priority.name
        holder.statusText.text = request.status.name
        
        val date = java.text.SimpleDateFormat("MMM dd, yyyy", java.util.Locale.getDefault())
            .format(java.util.Date(request.requestedAt))
        holder.dateText.text = date
        
        // Set priority color
        val priorityColor = when (request.priority) {
            AppRequestPriority.LOW -> android.R.color.holo_blue_light
            AppRequestPriority.NORMAL -> android.R.color.holo_green_light
            AppRequestPriority.HIGH -> android.R.color.holo_orange_light
            AppRequestPriority.URGENT -> android.R.color.holo_red_light
        }
        holder.priorityText.setTextColor(holder.rootView.context.getColor(priorityColor))
        
        // Set status color
        val statusColor = when (request.status) {
            AppRequestStatus.PENDING -> android.R.color.holo_orange_light
            AppRequestStatus.APPROVED -> android.R.color.holo_green_light
            AppRequestStatus.REJECTED -> android.R.color.holo_red_light
            AppRequestStatus.INSTALLING -> android.R.color.holo_blue_light
            AppRequestStatus.INSTALLED -> android.R.color.holo_green_dark
            AppRequestStatus.FAILED -> android.R.color.holo_red_dark
            AppRequestStatus.CANCELLED -> android.R.color.darker_gray
        }
        holder.statusText.setTextColor(holder.rootView.context.getColor(statusColor))
        
        holder.rootView.setOnClickListener {
            onItemClick(request)
        }
    }
    
    override fun getItemCount() = requests.size
}
