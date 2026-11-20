package com.granularsafeareas

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/**
 * An empty view in a screen. It reports whether it's in a window: react-native-screens takes the screens that aren't
 * showing out of it (the screens below the top of a stack, unselected tabs). Android has no place for a system back
 * button, so it never shows one.
 */
class GSAAnchorView(context: ThemedReactContext) : ReactViewGroup(context) {
  /** What JS currently believes. JS assumes "in a window" until told otherwise, so the first frame is already right. */
  private var reportedInWindow = true
  private var checkScheduled = false

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    scheduleCheck()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    scheduleCheck()
  }

  /** After everything happening now: a screen detached and attached again in one go never left. */
  private fun scheduleCheck() {
    if (checkScheduled) return
    checkScheduled = true
    Handler(Looper.getMainLooper()).post {
      checkScheduled = false
      val inWindow = isAttachedToWindow
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
