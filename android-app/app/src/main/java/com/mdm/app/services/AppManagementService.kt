package com.mdm.app.services

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.app.PendingIntent
import android.net.Uri
import android.os.Build
import android.util.Log
import com.mdm.app.models.AppInstallationPackage
import com.mdm.app.models.AppRequest
import com.mdm.app.models.AppRequestPriority
import com.mdm.app.models.AppRequestStatus
import com.mdm.app.utils.PreferenceManager
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Service for managing application installation, updates, and configuration
 */
class AppManagementService(private val context: Context) {
    
    companion object {
        private const val TAG = "AppManagementService"
        private const val DOWNLOAD_TIMEOUT = 300L // 5 minutes
        private const val BUFFER_SIZE = 8192
        private const val APK_DIRECTORY = "apk_downloads"
    }
    
    private val preferenceManager = PreferenceManager.getInstance(context)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(DOWNLOAD_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(DOWNLOAD_TIMEOUT, TimeUnit.SECONDS)
        .writeTimeout(DOWNLOAD_TIMEOUT, TimeUnit.SECONDS)
        .build()
    
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    /**
     * Download and install APK from URL
     */
    suspend fun downloadAndInstallApp(appPackage: AppInstallationPackage): AppInstallResult = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Starting app installation: ${appPackage.appName}")
            
            // Create download directory
            val downloadDir = createDownloadDirectory()
            
            // Download APK file
            val apkFile = downloadApkFile(appPackage.apkUrl, appPackage.packageName, downloadDir)
            
            // Verify APK hash if provided
            if (appPackage.apkHash.isNotEmpty()) {
                val calculatedHash = calculateFileHash(apkFile)
                if (calculatedHash != appPackage.apkHash) {
                    throw Exception("APK hash verification failed. Expected: ${appPackage.apkHash}, Got: $calculatedHash")
                }
                Log.i(TAG, "APK hash verification successful")
            }
            
            // Install APK
            val installResult = installApkFile(apkFile, appPackage.packageName)
            
            if (installResult.success) {
                // Clean up downloaded file
                apkFile.delete()
                Log.i(TAG, "App installation successful: ${appPackage.appName}")
                AppInstallResult(true, installResult.sessionId, null)
            } else {
                throw Exception("APK installation failed: ${installResult.error}")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "App installation failed: ${appPackage.appName}", e)
            AppInstallResult(false, null, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Submit app request to server
     */
    suspend fun submitAppRequest(appName: String, packageName: String?, reason: String, priority: AppRequestPriority): AppRequestResult {
        return try {
            val deviceId = preferenceManager.getDeviceId() ?: throw Exception("Device not enrolled")
            val userId = preferenceManager.getUserId() ?: "unknown"
            
            val request = AppRequest(
                id = generateRequestId(),
                userId = userId,
                deviceId = deviceId,
                appPackageName = packageName,
                appName = appName,
                requestReason = reason,
                priority = priority,
                status = AppRequestStatus.PENDING,
                requestedAt = System.currentTimeMillis()
            )
            
            // TODO: Send request to server via API
            // For now, simulate success
            Log.i(TAG, "App request submitted: $appName")
            AppRequestResult(true, request.id, null)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit app request: $appName", e)
            AppRequestResult(false, null, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Get list of installed applications
     */
    fun getInstalledApps(includeSystemApps: Boolean = false): List<AppInfo> {
        val packageManager = context.packageManager
        val installedApps = mutableListOf<AppInfo>()
        
        try {
            val packages = if (includeSystemApps) {
                packageManager.getInstalledPackages(0)
            } else {
                packageManager.getInstalledPackages(PackageManager.GET_UNINSTALLED_PACKAGES)
            }
            
            for (packageInfo in packages) {
                // Skip system apps if not requested
                if (!includeSystemApps && (packageInfo.applicationInfo?.flags?.and(android.content.pm.ApplicationInfo.FLAG_SYSTEM) ?: 0) != 0) {
                    continue
                }
                
                val appInfo = AppInfo(
                    packageName = packageInfo.packageName,
                    appName = packageInfo.applicationInfo?.loadLabel(packageManager)?.toString() ?: "Unknown",
                    version = packageInfo.versionName ?: "Unknown",
                    versionCode = packageInfo.longVersionCode,
                    isSystemApp = (packageInfo.applicationInfo?.flags?.and(android.content.pm.ApplicationInfo.FLAG_SYSTEM) ?: 0) != 0,
                    installTime = packageInfo.firstInstallTime,
                    updateTime = packageInfo.lastUpdateTime,
                    permissions = packageInfo.requestedPermissions?.toList() ?: emptyList(),
                    isEnabled = packageInfo.applicationInfo?.enabled ?: false,
                    sourceDir = packageInfo.applicationInfo?.sourceDir ?: ""
                )
                
                installedApps.add(appInfo)
            }
            
            // Sort by app name
            installedApps.sortBy { it.appName.lowercase() }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error getting installed apps", e)
        }
        
        return installedApps
    }
    
    /**
     * Uninstall application
     */
    suspend fun uninstallApp(packageName: String): UninstallResult {
        return try {
            // Check if app is installed
            val packageInfo = context.packageManager.getPackageInfo(packageName, 0)
            
            // Create uninstall intent
            val intent = Intent(Intent.ACTION_DELETE)
            intent.data = Uri.parse("package:$packageName")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            
            // Start uninstall activity
            context.startActivity(intent)
            
            Log.i(TAG, "Uninstall intent sent for: $packageName")
            UninstallResult(true, "Uninstall intent sent", null)
            
        } catch (e: PackageManager.NameNotFoundException) {
            Log.w(TAG, "App not found: $packageName")
            UninstallResult(false, null, "Application not found")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to uninstall app: $packageName", e)
            UninstallResult(false, null, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Update application
     */
    suspend fun updateApp(packageName: String, updateUrl: String): AppUpdateResult {
        return try {
            Log.i(TAG, "Starting app update: $packageName")
            
            // Create download directory
            val downloadDir = createDownloadDirectory()
            
            // Download updated APK
            val apkFile = downloadApkFile(updateUrl, "${packageName}_update", downloadDir)
            
            // Install updated APK
            val installResult = installApkFile(apkFile, packageName)
            
            if (installResult.success) {
                // Clean up downloaded file
                apkFile.delete()
                Log.i(TAG, "App update successful: $packageName")
                AppUpdateResult(true, installResult.sessionId, null)
            } else {
                throw Exception("App update failed: ${installResult.error}")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "App update failed: $packageName", e)
            AppUpdateResult(false, null, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Configure application settings
     */
    suspend fun configureApp(packageName: String, configData: Map<String, Any>): AppConfigResult {
        return try {
            Log.i(TAG, "Configuring app: $packageName with config: $configData")
            
            // TODO: Implement app-specific configuration
            // This could involve:
            // - Setting app preferences
            // - Configuring app permissions
            // - Setting up app data
            // - Configuring app-specific policies
            
            val configId = generateConfigId()
            Log.i(TAG, "App configuration applied: $packageName")
            
            AppConfigResult(true, configId, null)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to configure app: $packageName", e)
            AppConfigResult(false, null, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Create download directory
     */
    private fun createDownloadDirectory(): File {
        val downloadDir = File(context.filesDir, APK_DIRECTORY)
        if (!downloadDir.exists()) {
            downloadDir.mkdirs()
        }
        return downloadDir
    }
    
    /**
     * Download APK file from URL
     */
    private suspend fun downloadApkFile(url: String, fileName: String, downloadDir: File): File = withContext(Dispatchers.IO) {
        val apkFile = File(downloadDir, "${fileName}_${System.currentTimeMillis()}.apk")
        
        val request = Request.Builder()
            .url(url)
            .build()
        
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Download failed: ${response.code}")
            }
            
            val body = response.body ?: throw IOException("Empty response body")
            val contentLength = body.contentLength()
            
            FileOutputStream(apkFile).use { output ->
                val input: InputStream = body.byteStream()
                val buffer = ByteArray(BUFFER_SIZE)
                var bytesRead: Int
                var totalBytesRead = 0L
                
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    totalBytesRead += bytesRead
                    
                    // Log progress for large files
                    if (contentLength > 0 && totalBytesRead % (1024 * 1024) == 0L) {
                        val progress = (totalBytesRead * 100 / contentLength).toInt()
                        Log.d(TAG, "Download progress: $progress%")
                    }
                }
            }
        }
        
        Log.i(TAG, "APK downloaded: ${apkFile.absolutePath}")
        apkFile
    }
    
    /**
     * Calculate SHA-256 hash of file
     */
    private fun calculateFileHash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(BUFFER_SIZE)
        
        file.inputStream().use { input ->
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        
        val hashBytes = digest.digest()
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Install APK file using PackageInstaller
     */
    private suspend fun installApkFile(apkFile: File, packageName: String): InstallResult = withContext(Dispatchers.IO) {
        try {
            val packageInstaller = context.packageManager.packageInstaller
            
            // Create install session
            val sessionParams = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            sessionParams.setAppPackageName(packageName)
            
            val sessionId = packageInstaller.createSession(sessionParams)
            val session = packageInstaller.openSession(sessionId)
            
            try {
                // Copy APK to session
                apkFile.inputStream().use { input ->
                    session.openWrite("package", 0, apkFile.length()).use { output ->
                        input.copyTo(output)
                    }
                }
                
                // Commit session
                val intent = Intent(context, AppInstallReceiver::class.java)
                intent.action = "com.mdm.app.INSTALL_COMPLETE"
                intent.putExtra("sessionId", sessionId)
                intent.putExtra("packageName", packageName)
                
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                
                session.commit(pendingIntent.intentSender)
                
                Log.i(TAG, "APK installation session committed: $packageName")
                InstallResult(true, sessionId.toString(), null)
                
            } finally {
                session.close()
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to install APK: $packageName", e)
            InstallResult(false, null, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Generate unique request ID
     */
    private fun generateRequestId(): String {
        return "req_${System.currentTimeMillis()}_${(0..9999).random()}"
    }
    
    /**
     * Generate unique config ID
     */
    private fun generateConfigId(): String {
        return "config_${System.currentTimeMillis()}_${(0..9999).random()}"
    }
    
    // Data classes for results
    data class AppInstallResult(
        val success: Boolean,
        val sessionId: String?,
        val error: String?
    )
    
    data class AppRequestResult(
        val success: Boolean,
        val requestId: String?,
        val error: String?
    )
    
    data class AppUpdateResult(
        val success: Boolean,
        val sessionId: String?,
        val error: String?
    )
    
    data class AppConfigResult(
        val success: Boolean,
        val configId: String?,
        val error: String?
    )
    
    data class UninstallResult(
        val success: Boolean,
        val message: String?,
        val error: String?
    )
    
    data class InstallResult(
        val success: Boolean,
        val sessionId: String?,
        val error: String?
    )
    
    data class AppInfo(
        val packageName: String,
        val appName: String,
        val version: String,
        val versionCode: Long,
        val isSystemApp: Boolean,
        val installTime: Long,
        val updateTime: Long,
        val permissions: List<String>,
        val isEnabled: Boolean,
        val sourceDir: String
    )
}

/**
 * Broadcast receiver for installation completion
 */
class AppInstallReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val sessionId = intent.getIntExtra("sessionId", -1)
        val packageName = intent.getStringExtra("packageName")
        
        Log.i("AppInstallReceiver", "Installation completed for session: $sessionId, package: $packageName")
        
        // TODO: Send installation result to MDM service
        // This could involve updating the UI or sending status to server
    }
}
