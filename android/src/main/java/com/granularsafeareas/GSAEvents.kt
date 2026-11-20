package com.granularsafeareas

import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event

/** A direct event with a payload built up front. Never coalesced: each one is a state JS has to see. */
internal class GSAEvent(
    surfaceId: Int,
    viewTag: Int,
    private val name: String,
    private val data: WritableMap,
) : Event<GSAEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = name

  override fun canCoalesce(): Boolean = false

  override fun getEventData(): WritableMap = data

  companion object {
    const val INSETS_CHANGE = "topInsetsChange"
    const val ACCESSORY_CHANGE = "topAccessoryChange"
    const val METRICS_CHANGE = "topMetricsChange"
    const val WINDOW_CHANGE = "topWindowChange"
    const val BUTTON_PRESS = "topButtonPress"

    /** The direct events a view manager exports, by native name. */
    fun constants(vararg names: String): MutableMap<String, Any> =
        names.associateWithTo(mutableMapOf()) { name ->
          mapOf("registrationName" to "on" + name.removePrefix("top"))
        }

    /** Sends `name` from `view` to JS. Returns false when the view isn't mounted in a surface. */
    fun dispatch(view: View, name: String, build: WritableMap.() -> Unit): Boolean {
      val context = view.context as? ReactContext ?: return false
      val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.id) ?: return false
      val data = Arguments.createMap().apply(build)
      dispatcher.dispatchEvent(GSAEvent(UIManagerHelper.getSurfaceId(view), view.id, name, data))
      return true
    }
  }
}
