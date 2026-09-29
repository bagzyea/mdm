package com.mdm.app.api

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The agent kept only its access token and could not renew it, so an hour after
 * enrolling it was locked out of both HTTP and the socket. These pin the renewal rules.
 */
class TokenRefresherTest {

    private class FakeStore(
        var access: String?,
        var refresh: String?
    ) : TokenStore {
        override fun getDeviceToken() = access
        override fun setDeviceToken(token: String) { access = token }
        override fun getRefreshToken() = refresh
    }

    private lateinit var server: MockWebServer

    @Before fun setUp() { server = MockWebServer().apply { start() } }
    @After fun tearDown() { server.shutdown() }

    private fun refresher(store: TokenStore) =
        TokenRefresher(store, server.url("/api/devices/token/refresh").toString(), OkHttpClient())

    @Test fun `stores the new access token and sends the refresh token`() {
        server.enqueue(MockResponse().setBody("""{"success":true,"deviceToken":"new-access"}"""))
        val store = FakeStore(access = "old-access", refresh = "refresh-1")

        assertEquals(TokenRefresher.Outcome.REFRESHED, refresher(store).refresh("old-access"))

        assertEquals("new-access", store.access)
        val body = server.takeRequest().body.readUtf8()
        assertTrue(body.contains("\"refreshToken\":\"refresh-1\""))
    }

    @Test fun `does not refresh again when another caller already replaced the token`() {
        val store = FakeStore(access = "already-new", refresh = "refresh-1")

        assertEquals(TokenRefresher.Outcome.REFRESHED, refresher(store).refresh("old-access"))
        assertEquals(0, server.requestCount)
    }

    @Test fun `reports a revoked device when the server refuses the refresh token`() {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"code":"DEVICE_REVOKED"}"""))
        val store = FakeStore(access = "old-access", refresh = "refresh-1")

        assertEquals(TokenRefresher.Outcome.REVOKED, refresher(store).refresh("old-access"))
        assertEquals("old-access", store.access)
    }

    @Test fun `reports revoked without a request when there is no refresh token`() {
        val store = FakeStore(access = "old-access", refresh = null)

        assertEquals(TokenRefresher.Outcome.REVOKED, refresher(store).refresh("old-access"))
        assertEquals(0, server.requestCount)
    }

    @Test fun `reports a transient failure on a server error`() {
        server.enqueue(MockResponse().setResponseCode(503))
        val store = FakeStore(access = "old-access", refresh = "refresh-1")

        assertEquals(TokenRefresher.Outcome.FAILED, refresher(store).refresh("old-access"))
    }
}
