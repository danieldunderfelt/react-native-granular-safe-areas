package com.granularsafeareas

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/**
 * `GranularSafeAreaView`. A `View` in every other way: it extends React Native's view manager, so all of `View`'s
 * props keep working, and its own props are set through `@ReactProp`.
 */
class GSASafeAreaViewManager : ReactViewManager() {
  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = GSASafeAreaView(context)

  private fun ReactViewGroup.safeArea() = this as? GSASafeAreaView

  @ReactProp(name = "regions")
  fun setRegions(view: ReactViewGroup, value: ReadableArray?) {
    view.safeArea()?.setRegions(value)
  }

  @ReactProp(name = "bands")
  fun setBands(view: ReactViewGroup, value: ReadableArray?) {
    view.safeArea()?.setBands(value)
  }

  @ReactProp(name = "edges", defaultInt = 15)
  fun setEdges(view: ReactViewGroup, value: Int) {
    view.safeArea()?.setEdges(value)
  }

  @ReactProp(name = "granular")
  fun setGranular(view: ReactViewGroup, value: Boolean) {
    view.safeArea()?.setGranular(value)
  }

  @ReactProp(name = "dynamic")
  fun setDynamic(view: ReactViewGroup, value: Boolean) {
    view.safeArea()?.setDynamic(value)
  }

  @ReactProp(name = "applyOffset")
  fun setApplyOffset(view: ReactViewGroup, value: Boolean) {
    view.safeArea()?.setApplyOffset(value)
  }

  @ReactProp(name = "reportInsets")
  fun setReportInsets(view: ReactViewGroup, value: Boolean) {
    view.safeArea()?.setReportInsets(value)
  }

  @ReactProp(name = "margins")
  fun setMargins(view: ReactViewGroup, value: ReadableMap?) {
    view.safeArea()?.setMargins(value)
  }

  @ReactProp(name = "initialInsets")
  fun setInitialInsets(view: ReactViewGroup, value: ReadableMap?) {
    view.safeArea()?.setInitialInsets(value)
  }

  @ReactProp(name = "underlying")
  fun setUnderlying(view: ReactViewGroup, value: Boolean) {
    view.safeArea()?.setUnderlying(value)
  }

  @ReactProp(name = "ownerId", defaultInt = 0)
  fun setOwnerId(view: ReactViewGroup, value: Int) {
    view.safeArea()?.setOwnerId(value)
  }

  override fun onAfterUpdateTransaction(view: ReactViewGroup) {
    super.onAfterUpdateTransaction(view)
    view.safeArea()?.afterUpdate()
  }

  // Every way React Native sets a transform (the prop, Animated, Reanimated, a size change re-resolving percentages)
  // ends here. The view's translation goes back on top of it.
  override fun setTransformProperty(
      view: ReactViewGroup,
      transforms: ReadableArray?,
      transformOrigin: ReadableArray?,
  ) {
    super.setTransformProperty(view, transforms, transformOrigin)
    view.safeArea()?.transformDidChange()
  }

  override fun onDropViewInstance(view: ReactViewGroup) {
    view.safeArea()?.dropped()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
      (super.getExportedCustomDirectEventTypeConstants() ?: mutableMapOf()).apply {
        putAll(GSAEvent.constants(GSAEvent.INSETS_CHANGE, GSAEvent.ACCESSORY_CHANGE))
      }

  companion object {
    const val NAME = "GranularSafeAreaView"
  }
}
