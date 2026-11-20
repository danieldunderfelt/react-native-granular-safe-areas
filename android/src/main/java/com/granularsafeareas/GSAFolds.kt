package com.granularsafeareas

import android.app.Activity
import android.graphics.Rect
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import java.lang.ref.WeakReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** A fold or hinge of the display, in the activity's window coordinates, in pixels. */
internal data class GSAFold(
    val bounds: Rect,
    /** A fold half open, or a hinge that separates the display: it divides the app. */
    val active: Boolean,
    val state: String,
    val orientation: String,
    val occlusion: String,
    val separating: Boolean,
)

/**
 * Folds and hinges, from Jetpack WindowManager, for the activity the app runs in. Collected while anyone listens;
 * listeners hear about every change.
 */
internal object GSAFolds {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var activity: WeakReference<Activity>? = null
  private var job: Job? = null
  private var latest: WindowLayoutInfo? = null
  private val listeners = LinkedHashSet<() -> Unit>()

  /** Bumped on every change, so watchers can tell cheaply whether anything changed. */
  var version = 0
    private set

  /** The folds of `activity` right now, in its window's coordinates. */
  fun current(activity: Activity?): List<GSAFold> {
    activity ?: return emptyList()
    val info =
        latest.takeIf { this.activity?.get() === activity }
            ?: try {
              WindowInfoTracker.getOrCreate(activity).getCurrentWindowLayoutInfo(activity)
            } catch (_: Throwable) {
              null
            }
    return info?.displayFeatures?.filterIsInstance<FoldingFeature>()?.map(::foldOf) ?: emptyList()
  }

  /** Starts following `activity`'s folds while `listener` is subscribed. Returns the unsubscribe function. */
  fun subscribe(activity: Activity, listener: () -> Unit): () -> Unit {
    listeners.add(listener)
    follow(activity)
    return {
      listeners.remove(listener)
      if (listeners.isEmpty()) stop()
    }
  }

  private fun follow(activity: Activity) {
    if (this.activity?.get() === activity && job != null) return
    stop()
    this.activity = WeakReference(activity)
    job =
        scope.launch {
          try {
            WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { info ->
              if (info != latest) {
                latest = info
                version++
                listeners.toList().forEach { it() }
              }
            }
          } catch (_: Throwable) {
            // No window extensions on this device: no folds to report.
          }
        }
  }

  private fun stop() {
    job?.cancel()
    job = null
    latest = null
    activity = null
  }

  private fun foldOf(feature: FoldingFeature) =
      GSAFold(
          bounds = Rect(feature.bounds),
          active = feature.state == FoldingFeature.State.HALF_OPENED || feature.isSeparating,
          state = feature.state.toString(),
          orientation = feature.orientation.toString(),
          occlusion = feature.occlusionType.toString(),
          separating = feature.isSeparating,
      )
}
