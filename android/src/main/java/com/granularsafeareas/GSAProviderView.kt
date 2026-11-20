package com.granularsafeareas

import android.view.View
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager
import java.lang.ref.WeakReference

/** `GranularSafeAreaProvider`'s native view: reports its metrics, in its own coordinates, whenever they change. */
class GSAProviderView(private val reactContext: ThemedReactContext) : ReactViewGroup(reactContext) {
  private val monitor =
      GSAMetricsMonitor(this, { reactContext.currentActivity }) { payload ->
        GSAEvent.dispatch(this, GSAEvent.METRICS_CHANGE) { putString("payload", payload) }
      }

  init {
    providers.add(WeakReference(this))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    monitor.attach()
  }

  override fun onDetachedFromWindow() {
    monitor.detach()
    super.onDetachedFromWindow()
  }

  /** Re-reads everything and reports if anything changed. Also the `refresh` command. */
  fun refresh() = monitor.refresh()

  /** [refresh], once, for everything coming back to the window together. */
  fun scheduleRefresh() = monitor.scheduleRefresh()

  companion object {
    /** Every provider, so content outside any of them (a Modal's window) can find the one it's measured in. */
    private val providers = ArrayList<WeakReference<GSAProviderView>>()

    private fun isOutermost(provider: GSAProviderView): Boolean {
      var ancestor = provider.parent
      while (ancestor != null) {
        if (ancestor is GSAProviderView) return false
        ancestor = ancestor.parent
      }
      return true
    }

    /**
     * The provider `view`'s regions are in: the nearest one above it, or else the outermost one in its window, or in
     * any window: JS hands a Modal's content without a provider of its own the regions of the one around the Modal.
     */
    fun providerFor(view: View): GSAProviderView? {
      var ancestor = view.parent
      while (ancestor != null) {
        if (ancestor is GSAProviderView) return ancestor
        ancestor = ancestor.parent
      }
      providers.removeAll { it.get() == null }
      val outermost =
          providers.mapNotNull { it.get() }.filter { it.isAttachedToWindow && isOutermost(it) }
      val root = view.rootView
      return outermost.firstOrNull { it.rootView === root } ?: outermost.firstOrNull()
    }
  }
}

class GSAProviderViewManager : ReactViewManager() {
  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = GSAProviderView(context)

  override fun receiveCommand(root: ReactViewGroup, commandId: String, args: ReadableArray?) {
    if (commandId == "refresh") (root as? GSAProviderView)?.refresh()
    else super.receiveCommand(root, commandId, args)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
      (super.getExportedCustomDirectEventTypeConstants() ?: mutableMapOf()).apply {
        putAll(GSAEvent.constants(GSAEvent.METRICS_CHANGE))
      }

  companion object {
    const val NAME = "GranularSafeAreaProviderView"
  }
}
