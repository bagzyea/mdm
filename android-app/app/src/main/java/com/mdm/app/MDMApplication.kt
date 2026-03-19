package com.mdm.app

import android.app.Application
import android.util.Log

/**
 * Main Application class for MDM Agent
 */
class MDMApplication : Application() {
    
    companion object {
        private const val TAG = "MDMApplication"
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "MDM Application starting...")
        
        // Initialize any global components here if needed
        initializeGlobalComponents()
    }
    
    private fun initializeGlobalComponents() {
        // Initialize global singletons or perform one-time setup
        // This could include crash reporting, analytics, etc.
        Log.i(TAG, "Global components initialized")
    }
}