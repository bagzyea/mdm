package com.mdm.app.ui

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import com.android.resources.NightMode
import com.mdm.app.R
import org.junit.Rule
import org.junit.Test

/**
 * Renders the agent's screens on the JVM so they can be reviewed without a device.
 *
 * There is no emulator for this project (the build host has no KVM), so layout changes
 * were previously unverifiable — the app could compile and still be unreadable in the
 * field, which is how a white-on-cyan button at 1.77:1 contrast came to ship. Paparazzi
 * renders the real layouts with the real theme, so contrast, spacing and dark mode are
 * reviewable, and a visual regression becomes a failing test.
 *
 *   ./gradlew recordPaparazziDebug   refresh images after a deliberate change
 *   ./gradlew verifyPaparazziDebug   fail on an accidental one
 */
private val TABLET = DeviceConfig.NEXUS_10

class MainScreenLightTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = TABLET,
        theme = "Theme.UBOSMDM",
        renderingMode = SessionParams.RenderingMode.V_SCROLL
    )

    @Test fun mainScreen() = paparazzi.snapshot(paparazzi.inflate(R.layout.activity_main))
}

/**
 * Dark mode gets its own rule rather than mutating the config mid-test: reconfiguring a
 * live Paparazzi session left progress indicators unfilled, which looked like a layout
 * bug and was not one.
 */
class MainScreenDarkTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = TABLET.copy(nightMode = NightMode.NIGHT),
        theme = "Theme.UBOSMDM",
        renderingMode = SessionParams.RenderingMode.V_SCROLL
    )

    @Test fun mainScreenDark() = paparazzi.snapshot(paparazzi.inflate(R.layout.activity_main))
}

/**
 * The status screen is long enough that rendering the whole scroll extent overflows the
 * image raster, so it is captured at device size — which is what an enumerator sees
 * anyway.
 */
class StatusScreenTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = TABLET,
        theme = "Theme.UBOSMDM",
        renderingMode = SessionParams.RenderingMode.NORMAL
    )

    @Test fun statusScreen() = paparazzi.snapshot(paparazzi.inflate(R.layout.activity_status))
}
