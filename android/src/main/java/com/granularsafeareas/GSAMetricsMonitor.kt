package com.granularsafeareas

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver

/**
 * Follows one view's metrics (a provider, or the activity's window) and reports them as JSON whenever they change.
 *
 * It checks before every frame, the way react-native-safe-area-context does: insets, the view's place in its window
 * and the window's size all show up there, whatever changed them. A cheap comparison of what the metrics depend on
 * comes first; the metrics are only built and compared when that changed.
 */
internal class GSAMetricsMonitor(
    private val view: View,
    private val activity: () -> Activity?,
    private val onChange: (String) -> Unit,
) {
  private var observer: ViewTreeObserver? = null
  private var unsubscribeFolds: (() -> Unit)? = null
  private var inputs: GSAMetrics.Inputs? = null
  private var reported: String? = null
  private var refreshScheduled = false
  private val preDraw =
      ViewTreeObserver.OnPreDrawListener {
        check(force = false)
        true
      }

  /** The latest metrics reported, if any. */
  val latest: String?
    get() = reported

  fun attach() {
    detach()
    observer = view.viewTreeObserver.also { it.addOnPreDrawListener(preDraw) }
    activity()?.let { unsubscribeFolds = GSAFolds.subscribe(it) { check(force = true) } }
    check(force = true)
  }

  fun detach() {
    observer?.let { if (it.isAlive) it.removeOnPreDrawListener(preDraw) }
    view.viewTreeObserver.let { if (it.isAlive) it.removeOnPreDrawListener(preDraw) }
    observer = null
    unsubscribeFolds?.invoke()
    unsubscribeFolds = null
    inputs = null
  }

  /** Re-reads everything. Reports only if something changed. */
  fun refresh() = check(force = true)

  /** [refresh], once, after everything happening now: views coming back to the window together share it. */
  fun scheduleRefresh() {
    if (refreshScheduled) return
    refreshScheduled = true
    Handler(Looper.getMainLooper()).post {
      refreshScheduled = false
      refresh()
    }
  }

  /** Reports the current metrics even if they didn't change: for a new listener. */
  fun resetReported() {
    reported = null
    check(force = true)
  }

  private fun check(force: Boolean) {
    if (!view.isAttachedToWindow) return
    val next = GSAMetrics.inputs(view)
    if (!force && next == inputs) return
    inputs = next
    val json = GSAMetrics.forView(view, activity())?.toString() ?: return
    if (json == reported) return
    reported = json
    onChange(json)
  }
}

/**
 * Follows the activity's window, for apps without a provider: its decor view's metrics, which are the window's.
 */
internal object GSAWindowObserver {
  private var monitor: GSAMetricsMonitor? = null
  private var decor: View? = null
  private var onChange: ((String) -> Unit)? = null
  private val attachListener =
      object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(v: View) {
          monitor?.attach()
        }

        override fun onViewDetachedFromWindow(v: View) {
          monitor?.detach()
        }
      }

  /** The window's latest metrics, while it's followed. */
  val latest: String?
    get() = monitor?.latest

  /** Starts following `activity`'s window. Reports its current metrics to `handler` straight away. */
  fun start(activity: Activity?, handler: (String) -> Unit) {
    onChange = handler
    follow(activity)
    monitor?.resetReported()
  }

  /** Follows `activity`'s window, if the observer is started: the activity can be replaced while the app runs. */
  fun follow(activity: Activity?) {
    if (onChange == null) return
    val view = activity?.window?.decorView ?: return
    if (view === decor) return
    stopMonitor()
    decor = view
    val next = GSAMetricsMonitor(view, { activity }) { json -> onChange?.invoke(json) }
    monitor = next
    view.addOnAttachStateChangeListener(attachListener)
    if (view.isAttachedToWindow) next.attach()
  }

  fun refresh() {
    monitor?.refresh()
  }

  fun scheduleRefresh() {
    monitor?.scheduleRefresh()
  }

  fun stop() {
    stopMonitor()
    onChange = null
  }

  private fun stopMonitor() {
    monitor?.detach()
    decor?.removeOnAttachStateChangeListener(attachListener)
    monitor = null
    decor = null
  }
}
