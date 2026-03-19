package com.mdm.app.api

import com.google.gson.annotations.SerializedName

/**
 * Generic API response model
 */
data class ApiResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("error")
    val error: String? = null,
    
    @SerializedName("data")
    val data: Any? = null
)

/**
 * Device policies response
 */
data class DevicePoliciesResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("policies")
    val policies: List<String>,
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("error")
    val error: String? = null
)

/**
 * Pending commands response
 */
data class PendingCommandsResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("commands")
    val commands: List<String>,
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("error")
    val error: String? = null
)

/**
 * App inventory response
 */
data class AppInventoryResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("apps")
    val apps: List<String>,
    
    @SerializedName("message")
    val message: String,
    
    @SerializedName("error")
    val error: String? = null
)
