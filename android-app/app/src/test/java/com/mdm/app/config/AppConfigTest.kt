package com.mdm.app.config

import org.junit.Test
import org.junit.Assert.*

class AppConfigTest {

    @Test
    fun `test server configuration constants`() {
        // Test that server URLs are not empty
        assertNotNull(AppConfig.Server.BASE_API_URL)
        assertNotNull(AppConfig.Server.WEBSOCKET_ENDPOINT)
        assertNotNull(AppConfig.Server.ENROLLMENT_ENDPOINT)
        
        // Test timeout values are reasonable
        assertTrue(AppConfig.Server.CONNECTION_TIMEOUT > 0)
        assertTrue(AppConfig.Server.READ_TIMEOUT > 0)
        assertTrue(AppConfig.Server.WRITE_TIMEOUT > 0)
    }

    @Test
    fun `test device configuration values`() {
        // Test heartbeat interval is reasonable (should be > 1 minute)
        assertTrue(AppConfig.Device.HEARTBEAT_INTERVAL >= 60_000L)
        
        // Test status update interval
        assertTrue(AppConfig.Device.STATUS_UPDATE_INTERVAL >= 60_000L)
        
        // Test battery check interval
        assertTrue(AppConfig.Device.BATTERY_CHECK_INTERVAL >= 60_000L)
        assertTrue(AppConfig.Device.LOW_BATTERY_THRESHOLD > 0)
        
        // Test storage monitoring
        assertTrue(AppConfig.Device.STORAGE_CHECK_INTERVAL >= 60_000L)
        assertTrue(AppConfig.Device.LOW_STORAGE_THRESHOLD > 0)
    }

    @Test
    fun `test security configuration`() {
        // Test security settings exist
        assertTrue(AppConfig.Security.ENABLE_CERTIFICATE_PINNING)
        assertTrue(AppConfig.Security.KEY_SIZE > 0)
        assertTrue(AppConfig.Security.IV_SIZE > 0)
    }

    @Test
    fun `test feature flags`() {
        // Test that feature flags are defined
        assertTrue(AppConfig.Features.ENABLE_KIOSK_MODE)
        assertTrue(AppConfig.Features.ENABLE_GEOFENCING)
        assertTrue(AppConfig.Features.ENABLE_APP_MANAGEMENT)
    }

    @Test
    fun `test network configuration`() {
        // Test network retry settings
        assertTrue(AppConfig.Network.MAX_RETRY_ATTEMPTS > 0)
        assertTrue(AppConfig.Network.RETRY_DELAY > 0)
        assertTrue(AppConfig.Network.PROXY_PORT > 0)
    }
}