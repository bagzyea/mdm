package com.mdm.app.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.mdm.app.util.AgentLog

/**
 * What this app is actually allowed to do (finding F-07).
 *
 * `PolicyEngine` previously guarded every policy call with `isAdminActive()`, which only
 * reports that a Device Admin receiver is enabled. Most of what it then called —
 * `addUserRestriction`, `setLockTaskPackages`, the password minimum APIs — requires
 * **Device Owner** or **Profile Owner**. On the Android 11–15 devices this app targets
 * those calls throw `SecurityException` or silently do nothing, and the exception was
 * caught and reported as a policy result, so the dashboard showed policies as applied
 * when nothing had been applied.
 *
 * Asking the platform which privilege is actually held, and refusing to attempt calls
 * above it, is what turns that silent failure into an honest `UNSUPPORTED`.
 */
enum class PrivilegeLevel {
    /** Full control. What a properly provisioned DPC holds. */
    DEVICE_OWNER,

    /** Work-profile owner. Most restrictions apply to the profile, not the device. */
    PROFILE_OWNER,

    /** Legacy Device Admin. Far less than the names of its APIs suggest. */
    DEVICE_ADMIN,

    /** Not administrator at all. */
    NONE;

    /** Whether this level is sufficient for a call that requires [required]. */
    fun satisfies(required: PrivilegeLevel): Boolean = rank >= required.rank

    private val rank: Int
        get() = when (this) {
            NONE -> 0
            DEVICE_ADMIN -> 1
            PROFILE_OWNER -> 2
            DEVICE_OWNER -> 3
        }
}

object DevicePrivilege {

    private const val TAG = "DevicePrivilege"

    fun of(context: Context, admin: ComponentName): PrivilegeLevel {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            ?: return PrivilegeLevel.NONE

        return try {
            when {
                dpm.isDeviceOwnerApp(context.packageName) -> PrivilegeLevel.DEVICE_OWNER
                dpm.isProfileOwnerApp(context.packageName) -> PrivilegeLevel.PROFILE_OWNER
                dpm.isAdminActive(admin) -> PrivilegeLevel.DEVICE_ADMIN
                else -> PrivilegeLevel.NONE
            }
        } catch (e: Exception) {
            AgentLog.w(TAG, "Could not determine privilege level", e)
            PrivilegeLevel.NONE
        }
    }

    /**
     * Human-readable explanation for a policy result, so an operator looking at the
     * dashboard learns why a setting did not apply rather than seeing a bare failure.
     */
    fun explain(held: PrivilegeLevel, required: PrivilegeLevel): String =
        "requires $required, this device has $held — the app is not provisioned as " +
            "device owner, so this setting cannot be enforced"
}
