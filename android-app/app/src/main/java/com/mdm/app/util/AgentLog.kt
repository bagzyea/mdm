package com.mdm.app.util

import android.util.Log

/**
 * Logging that cannot break the thing it is logging about.
 *
 * Policy application, command execution and credential handling all log as they go. A
 * logging call is the last thing that should be able to abort any of them, and
 * `android.util.Log` is a platform class backed by native methods — it throws
 * `UnsatisfiedLinkError` wherever those are not linked, which includes JVM unit tests
 * and some instrumentation contexts.
 *
 * That is not hypothetical: adding Paparazzi to this module put a real `android.jar` on
 * the unit-test classpath and six policy tests began failing inside `Log.w` — the code
 * under test was fine, the logging was not.
 *
 * Errors are swallowed deliberately. There is nowhere useful to report a failure to
 * report.
 */
object AgentLog {

    fun d(tag: String, message: String) = safely { Log.d(tag, message) }

    fun i(tag: String, message: String) = safely { Log.i(tag, message) }

    fun w(tag: String, message: String, throwable: Throwable? = null) = safely {
        if (throwable != null) Log.w(tag, message, throwable) else Log.w(tag, message)
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) = safely {
        if (throwable != null) Log.e(tag, message, throwable) else Log.e(tag, message)
    }

    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (_: Throwable) {
            // No logger available. Nothing to do, and nothing worth failing for.
        }
    }
}
