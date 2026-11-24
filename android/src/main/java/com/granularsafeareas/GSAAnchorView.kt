package com.granularsafeareas

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/**
 * An empty view in a screen. It reports whether its screen is showing: in a window (react-native-screens takes the
 * screens that aren't showing out of it: the screens below the top of a stack, unselected tabs), and neither hidden nor
 * fully transparent through an ancestor (a screen kept mounted with `opacity: 0` or `display: 'none'`). Android has no
 * place for a system back button, so it never shows one.
 */
class GSAAnchorView(context: ThemedReactContext) : ReactViewGroup(context) {
  /** What JS currently believes. JS assumes "showing" until told otherwise, so the first frame is already right. */
  private var reportedInWindow = true
  private var checkScheduled = false
  private var observer: ViewTreeObserver? = null

  /** Before every frame: an ancestor's visibility or alpha can change without the anchor moving. */
  private val preDraw =
      ViewTreeObserver.OnPreDrawListener {
        if (isShowing() != reportedInWindow) scheduleCheck()
        true
      }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    observer = viewTreeObserver.also { it.addOnPreDrawListener(preDraw) }
    scheduleCheck()
  }

  override fun onDetachedFromWindow() {
    for (target in listOfNotNull(observer, viewTreeObserver)) {
      if (target.isAlive) target.removeOnPreDrawListener(preDraw)
    }
    observer = null
    super.onDetachedFromWindow()
    scheduleCheck()
  }

  /** In a window, and no ancestor hidden or fully transparent. The anchor itself is always transparent. */
  private fun isShowing(): Boolean {
    if (!isAttachedToWindow) return false
    var current = parent as? View
    while (current != null) {
      if (current.visibility != View.VISIBLE || current.alpha < 0.01f) return false
      current = current.parent as? View
    }
    return true
  }

  /** After everything happening now: a screen detached and attached again in one go never left. */
  private fun scheduleCheck() {
    if (checkScheduled) return
    checkScheduled = true
    Handler(Looper.getMainLooper()).post {
      checkScheduled = false
      val inWindow = isShowing()
      if (inWindow != reportedInWindow &&
          GSAEvent.dispatch(this, GSAEvent.WINDOW_CHANGE) { putBoolean("inWindow", inWindow) }) {
        reportedInWindow = inWindow
      }
    }
  }
}

class GSAAnchorViewManager : ReactViewManager() {
  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = GSAAnchorView(context)

  /** The system back button to show. There's no place for one on Android. */
  @Suppress("UNUSED_PARAMETER")
  @ReactProp(name = "button")
  fun setButton(view: ReactViewGroup, button: ReadableMap?) {}

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
      (super.getExportedCustomDirectEventTypeConstants() ?: mutableMapOf()).apply {
        putAll(GSAEvent.constants(GSAEvent.WINDOW_CHANGE, GSAEvent.BUTTON_PRESS))
      }

  companion object {
    const val NAME = "GranularSafeAreaAnchor"
  }
}
