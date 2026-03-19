package com.mdm.app.models

import com.google.gson.annotations.SerializedName

/**
 * Device policy model for policy enforcement
 */
data class DevicePolicy(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("name")
    val name: String,
    
    @SerializedName("description")
    val description: String,
    
    @SerializedName("type")
    val type: String, // SECURITY, NETWORK, APPLICATION, COMPLIANCE
    
    @SerializedName("rules")
    val rules: Map<String, Any>,
    
    @SerializedName("targetDevices")
    val targetDevices: List<String>,
    
    @SerializedName("priority")
    val priority: Int = 0,
    
    @SerializedName("isActive")
    val isActive: Boolean = true,
    
    @SerializedName("createdAt")
    val createdAt: String,
    
    @SerializedName("updatedAt")
    val updatedAt: String
)

