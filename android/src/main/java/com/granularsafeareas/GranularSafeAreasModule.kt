package com.granularsafeareas

import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

class GranularSafeAreasModule(reactContext: ReactApplicationContext) :
    NativeGranularSafeAreasSpec(reactContext), LifecycleEventListener {

  init {
    reactContext.addLifecycleEventListener(this)
  }

  /**
   * The activity window's metrics, read synchronously so the first frame is laid out with real regions, the way
   * react-native-safe-area-context's `initialWindowMetrics` is. Views are read on the UI thread; if it's busy for too
   * long, there are none, and the provider starts from react-native-safe-area-context's insets until it reports.
   */
  override fun getTypedExportedConstants(): MutableMap<String, Any> {
    val read = { GSAWindowObserver.latest ?: windowMetrics() }
    val json =
        if (UiThreadUtil.isOnUiThread()) {
          read()
        } else {
          val task = FutureTask(read)
          UiThreadUtil.runOnUiThread(task)
          try {
            task.get(500, TimeUnit.MILLISECONDS)
          } catch (_: Exception) {
            null
          }
        }
    return mutableMapOf("initialWindowMetrics" to (json ?: ""))
  }

  private fun windowMetrics(): String? {
    val activity = reactApplicationContext.currentActivity ?: return null
    val decor = activity.window?.decorView ?: return null
    return GSAMetrics.forView(decor, activity)?.toString()
  }

  override fun getDiagnostics(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        promise.resolve(GSAMetrics.diagnostics(reactApplicationContext.currentActivity).toString(2))
      } catch (error: Exception) {
        promise.reject("diagnostics", error)
      }
    }
  }

  override fun observeWindow() {
    UiThreadUtil.runOnUiThread {
      GSAWindowObserver.start(reactApplicationContext.currentActivity) { json ->
        emitOnWindowMetricsChange(json)
      }
    }
  }

  override fun refreshWindow() {
    UiThreadUtil.runOnUiThread { GSAWindowObserver.refresh() }
  }

  override fun onHostResume() {
    GSAWindowObserver.follow(reactApplicationContext.currentActivity)
  }

  override fun onHostPause() {}

  override fun onHostDestroy() {}

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    UiThreadUtil.runOnUiThread { GSAWindowObserver.stop() }
    super.invalidate()
  }

  companion object {
    const val NAME = NativeGranularSafeAreasSpec.NAME
  }
}
