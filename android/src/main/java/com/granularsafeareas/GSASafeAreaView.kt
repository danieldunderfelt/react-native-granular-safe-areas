package com.granularsafeareas

import android.graphics.RectF
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.views.view.ReactViewGroup
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max

/**
 * `SafeAreaView`'s native view: measures itself in its provider and works out the insets it needs there. It applies
 * `offset` itself (a translation on top of its own transform) and reports the rest for JS to apply.
 *
 * It measures before every frame. A static view is measured as laid out, so where an animation (a screen transition)
 * has it for the moment doesn't count; a dynamic view where it's drawn right now, so it follows itself as it moves,
 * scrolling and animations included, in the same frame. `GSASafeAreaView.mm` does the same on iOS, and
 * `safeAreaViewInsets` in geometry.ts from JS; keep the three in step.
 *
 * Everything is in pixels here; regions and reported insets are in dp.
 */
class GSASafeAreaView(context: ThemedReactContext) : ReactViewGroup(context) {
  /** A region to avoid, in the provider's coordinates. JS has already applied `avoid` and `spacing`. */
  private class Region(
      val frame: RectF,
      /** 0 for a floating region, then 1 top, 2 right, 3 bottom, 4 left. */
      val edge: Int,
      /**
       * For a region in a corner (iPad window controls): the other edge it hugs, coded like [edge], or 0. A view moves
       * away from it instead of [edge] when moving away from [edge] would take more than half of the view.
       */
      val side: Int,
      /** The view that draws it (an accessory), or 0 for system UI. */
      val owner: Int,
      /** A whole inset band. */
      val band: Boolean,
  ) {
    /** Whether it's drawn on top of this view, so it can cover it. System UI always is. */
    var covers = owner == 0
    /** What [covers] was worked out from: the owner's view, its parent, and whether it was in a window. */
    var checkedView: WeakReference<View>? = null
    var checkedParent: Any? = null
    var checkedAttached = false
  }

  private var regions = emptyList<Region>()
  private var bands = emptyList<Region>()
  private var edges = TOP or RIGHT or BOTTOM or LEFT
  private var granular = false
  private var dynamic = false
  private var applyOffset = false
  private var reportInsets = false
  private var underlying = false
  /** `mode="margin"`: the margin JS added, which moved the view's box in. It's measured without it. */
  private val margins = RectF()
  private val initialInsets = RectF()
  /** `SafeAreaAccessory`: the id this view registers under as a region owner, and where it last said it's drawn. */
  private var ownerId = 0
  private var accessoryShown = false
  private val reportedAccessory = RectF()

  private var provider: WeakReference<GSAProviderView>? = null
  private var observer: ViewTreeObserver? = null
  private var wasAttached = false
  /** Set when the view hierarchy may have changed, so which app UI is drawn on top of this view is worked out again. */
  private var coversDirty = true

  /** Offset mode: the translation applied, the translation React Native gave the view, and what was written. */
  private var offsetX = 0f
  private var offsetY = 0f
  private var baseX = 0f
  private var baseY = 0f
  private var writtenX = Float.NaN
  private var writtenY = Float.NaN

  /** The insets last sent to JS, in pixels: left, top, right, bottom. */
  private val reportedInsets = RectF()
  private var reported = false
  /** Whether the view has measured itself yet. Until it has, it uses what JS measured from React Native's layout. */
  private var measured = false

  private val epsilon = PixelUtil.toPixelFromDIP(0.25f)

  private val preDraw =
      ViewTreeObserver.OnPreDrawListener {
        measure()
        true
      }
  private val globalLayout = ViewTreeObserver.OnGlobalLayoutListener { coversDirty = true }

  // Props, applied together in [afterUpdate].

  internal fun setRegions(value: ReadableArray?) {
    regions = regionsFrom(value)
    coversDirty = true
  }

  internal fun setBands(value: ReadableArray?) {
    bands = regionsFrom(value)
    coversDirty = true
  }

  internal fun setEdges(value: Int) {
    edges = value
  }

  internal fun setGranular(value: Boolean) {
    granular = value
  }

  internal fun setDynamic(value: Boolean) {
    dynamic = value
  }

  internal fun setApplyOffset(value: Boolean) {
    applyOffset = value
  }

  internal fun setReportInsets(value: Boolean) {
    if (value != reportInsets) {
      reportInsets = value
      reported = reported && !measured
    }
  }

  internal fun setUnderlying(value: Boolean) {
    underlying = value
    coversDirty = true
  }

  internal fun setMargins(value: ReadableMap?) {
    read(value, margins)
  }

  internal fun setInitialInsets(value: ReadableMap?) {
    read(value, initialInsets)
  }

  internal fun setOwnerId(value: Int) {
    if (value == ownerId) return
    GSAOwners.unregister(ownerId, this)
    ownerId = value
    GSAOwners.register(ownerId, this)
    accessoryShown = false
  }

  /** After a batch of props: start from what JS measured until the view has measured itself, then measure. */
  internal fun afterUpdate() {
    var x = offsetX
    var y = offsetY
    if (!measured) {
      // Start from what JS measured from React Native's layout, so the first frame is right.
      x = initialInsets.left - initialInsets.right
      y = initialInsets.top - initialInsets.bottom
      reportedInsets.set(initialInsets)
      reported = true
    }
    if (applyOffset) applyOffset(x, y) else applyOffset(0f, 0f)
    // Measured before the next frame, once every ancestor is in its new place.
    invalidate()
  }

  /** React Native set the view's transform: put the translation back on top of it. */
  internal fun transformDidChange() {
    writtenX = Float.NaN
    writtenY = Float.NaN
    applyOffset(offsetX, offsetY)
  }

  internal fun dropped() {
    GSAOwners.unregister(ownerId, this)
  }

  // Change sources

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (wasAttached) {
      // Coming back (a Modal dismissed, a screen popped back to, a tab selected again) can change what's around the
      // provider, and the views coming back together share one re-read.
      GSAProviderView.providerFor(this)?.scheduleRefresh()
      GSAWindowObserver.scheduleRefresh()
    }
    wasAttached = true
    coversDirty = true
    provider = null
    observer =
        viewTreeObserver.also {
          it.addOnPreDrawListener(preDraw)
          it.addOnGlobalLayoutListener(globalLayout)
        }
  }

  override fun onDetachedFromWindow() {
    stopObserving()
    provider = null
    // An accessory out of the window (in a screen navigated away from, another tab) keeps its region: it covers
    // nothing while it's out, because every view checks that it's drawn on top of it, and it's right as soon as it's
    // back.
    super.onDetachedFromWindow()
  }

  private fun stopObserving() {
    for (target in listOfNotNull(observer, viewTreeObserver)) {
      if (target.isAlive) {
        target.removeOnPreDrawListener(preDraw)
        target.removeOnGlobalLayoutListener(globalLayout)
      }
    }
    observer = null
  }

  // Measuring

  /** The provider, while it's in a window. */
  private fun currentProvider(): GSAProviderView? {
    val known = provider?.get()
    if (known != null && known.isAttachedToWindow && !coversDirty) return known
    val found = GSAProviderView.providerFor(this)
    provider = found?.let { WeakReference(it) }
    return found
  }

  /**
   * Which regions can cover this view: system UI always; app UI when its view is drawn on top of this one (a Modal
   * isn't covered by the tab bar of the screen beneath it), or, with `underlying`, whenever it's drawn at all.
   */
  private fun updateCovers(list: List<Region>, force: Boolean) {
    for (region in list) {
      if (region.owner == 0) continue
      val owner = GSAOwners.view(region.owner)
      val attached = owner?.isAttachedToWindow == true
      if (!force &&
          region.checkedView?.get() === owner &&
          region.checkedParent === owner?.parent &&
          region.checkedAttached == attached) {
        continue
      }
      region.checkedView = owner?.let { WeakReference(it) }
      region.checkedParent = owner?.parent
      region.checkedAttached = attached
      region.covers =
          owner != null &&
              attached &&
              if (underlying) owner.rootView === rootView && !GSAViews.areRelated(owner, this)
              else GSAViews.isDrawnAbove(owner, this)
    }
  }

  /** Measures where the view is in the provider and applies the insets it needs there. */
  private fun measure() {
    val parent = parent as? View ?: return
    if (!isAttachedToWindow) return
    // The regions are in the provider's coordinates; without one, in the window's.
    val space: View = currentProvider() ?: rootView
    val force = coversDirty
    coversDirty = false
    updateCovers(regions, force)
    updateCovers(bands, force)

    // A static view is measured as laid out, so where an animation has it for the moment doesn't count. A dynamic view
    // follows what's on screen. Either way without its own transform, so applying the offset never feeds back into
    // it, and without the margin JS gave it.
    val laidOut = !dynamic
    val rect =
        RectF(
            left - margins.left - parent.scrollX,
            top - margins.top - parent.scrollY,
            right + margins.right - parent.scrollX,
            bottom + margins.bottom - parent.scrollY,
        )
    if (!GSAViews.mapTo(rect, parent, space, laidOut)) return

    // Where the view can be seen: inside the provider and every clipping ancestor. And the scroll views around it.
    val visible = RectF(0f, 0f, space.width.toFloat(), space.height.toFloat())
    var axes = 0
    var ancestor: View? = parent
    while (ancestor != null && ancestor !== space) {
      if (GSAViews.clips(ancestor)) {
        val clip = RectF(0f, 0f, ancestor.width.toFloat(), ancestor.height.toFloat())
        if (GSAViews.mapTo(clip, ancestor, space, laidOut) && !visible.intersect(clip)) {
          visible.setEmpty()
        }
      }
      val scrollAxes = GSAViews.scrollAxes(ancestor)
      if (scrollAxes != 0) {
        if (GSAViews.pagingEnabled(ancestor)) {
          // A pager's content comes to rest on a page, so it's measured where it will rest, like content that doesn't
          // scroll. A dynamic view follows it as it moves instead.
          if (!dynamic) restInPager(rect, parent, ancestor, scrollAxes)
        } else {
          axes = axes or scrollAxes
        }
      }
      ancestor = ancestor.parent as? View
    }

    // A position along a scroll axis isn't fixed, so a view that doesn't follow it has to avoid whole bands, measured
    // as if it covered all of the scroll view it can be seen in. Regions on the edges it scrolls towards are the
    // scroll view's content inset's.
    val useRegions = dynamic || (granular && axes == 0)
    var ignored = 0
    if (axes and GSAViews.VERTICAL != 0) {
      ignored = ignored or TOP or BOTTOM
      if (!dynamic) {
        rect.top = visible.top
        rect.bottom = visible.bottom
      }
    }
    if (axes and GSAViews.HORIZONTAL != 0) {
      ignored = ignored or LEFT or RIGHT
      if (!dynamic) {
        rect.left = visible.left
        rect.right = visible.right
      }
    }
    // A static view entirely out of view keeps what it has: it isn't laid out there.
    if (!dynamic && !RectF.intersects(rect, visible)) return
    measured = true
    applyInsets(
        insetsFor(rect, visible, if (useRegions) regions else bandsThatCover(visible), ignored),
    )
    if (ownerId != 0) {
      // Where it's drawn, with its own offset: that's what covers the content beneath it.
      val drawn = RectF(0f, 0f, width.toFloat(), height.toFloat())
      if (GSAViews.mapTo(drawn, this, space, laidOut = false)) reportAccessory(drawn)
    }
  }

  /** Moves `rect` to where it will be once `pager` comes to rest on the page that holds the view's center. */
  private fun restInPager(rect: RectF, parent: View, pager: View, axes: Int) {
    val inPager =
        RectF(
            left.toFloat() - parent.scrollX,
            top.toFloat() - parent.scrollY,
            right.toFloat() - parent.scrollX,
            bottom.toFloat() - parent.scrollY,
        )
    if (!GSAViews.mapUp(inPager, parent, pager, laidOut = true)) return
    // In the pager's content, where its pages are.
    inPager.offset(pager.scrollX.toFloat(), pager.scrollY.toFloat())
    if (axes and GSAViews.HORIZONTAL != 0 && pager.width > 0) {
      val page = pager.width.toFloat()
      rect.offset(pager.scrollX - floor(inPager.centerX() / page) * page, 0f)
    }
    if (axes and GSAViews.VERTICAL != 0 && pager.height > 0) {
      val page = pager.height.toFloat()
      rect.offset(0f, pager.scrollY - floor(inPager.centerY() / page) * page)
    }
  }

  /**
   * The bands (and other regions) a view that avoids whole bands has to avoid: a band only counts when something in
   * it that covers the view reaches where the view can be seen. Without a breakdown, the band itself is in the list:
   * the system draws it, on top of everything.
   */
  private fun bandsThatCover(visible: RectF): List<Region> {
    val tolerance = PixelUtil.toPixelFromDIP(0.5f)
    return bands.filter { band ->
      band.covers &&
          (!band.band ||
              regions.any { region ->
                region.covers &&
                    RectF.intersects(region.frame, visible) &&
                    region.frame.left >= band.frame.left - tolerance &&
                    region.frame.top >= band.frame.top - tolerance &&
                    region.frame.right <= band.frame.right + tolerance &&
                    region.frame.bottom <= band.frame.bottom + tolerance
              })
    }
  }

  /**
   * How far each edge of `element` has to move in to clear the regions that cover it and that it overlaps, as left,
   * top, right, bottom. `computeElementInsets` in geometry.ts. Regions hugging an `ignored` edge (a scrolling edge) are
   * skipped.
   */
  private fun insetsFor(element: RectF, visible: RectF, list: List<Region>, ignored: Int): RectF {
    val out = RectF()
    // Only the part that can be seen counts: an element out of view has no insets, and every inset stays bounded.
    val el = RectF(element)
    if (!el.intersect(visible)) return out
    val need = FloatArray(4)
    for (region in list) {
      if (!region.covers || (region.edge != 0 && ignored and (1 shl (region.edge - 1)) != 0)) continue
      val f = region.frame
      if (!(el.left < f.right && f.left < el.right && el.top < f.bottom && f.top < el.bottom)) continue
      // Top, right, bottom, left.
      need[0] = f.bottom - el.top
      need[1] = el.right - f.left
      need[2] = el.bottom - f.top
      need[3] = f.right - el.left
      var best = -1
      if (region.side != 0 && region.edge != 0) {
        // A corner region: away from its edge, unless that takes more than half of the view; then away from its side.
        val e = region.edge - 1
        val side = region.side - 1
        val size = if (e == 0 || e == 2) el.height() else el.width()
        val edgeAllowed = edges and (1 shl e) != 0
        // A scrolling edge isn't a way out: the scroll view's content inset handles it.
        val sideAllowed = edges and (1 shl side) != 0 && ignored and (1 shl side) == 0
        best =
            when {
              edgeAllowed && need[e] <= size / 2 -> e
              sideAllowed -> side
              edgeAllowed -> e
              else -> -1
            }
      } else {
        for (i in 0 until 4) {
          if ((region.edge != 0 && region.edge != i + 1) || edges and (1 shl i) == 0) continue
          if (best < 0 || need[i] < need[best]) best = i
        }
      }
      when (best) {
        0 -> out.top = max(out.top, need[0])
        1 -> out.right = max(out.right, need[1])
        2 -> out.bottom = max(out.bottom, need[2])
        3 -> out.left = max(out.left, need[3])
      }
    }
    return out
  }

  private fun applyInsets(insets: RectF) {
    if (applyOffset) applyOffset(insets.left - insets.right, insets.top - insets.bottom)
    else applyOffset(0f, 0f)
    if (reportInsets) reportInsets(insets)
  }

  /**
   * Translates the view by `x`, `y` on top of the translation React Native gave it. Android applies translation after
   * scale and rotation, so it's in the parent's units even when the view scales or rotates.
   */
  private fun applyOffset(x: Float, y: Float) {
    val currentX = translationX
    val currentY = translationY
    val ours = currentX == writtenX && currentY == writtenY
    if (ours && abs(x - offsetX) < epsilon && abs(y - offsetY) < epsilon) return
    if (!ours) {
      // React Native or Reanimated set the translation since: that's the base now.
      baseX = currentX
      baseY = currentY
    }
    offsetX = x
    offsetY = y
    writtenX = baseX + x
    writtenY = baseY + y
    if (currentX != writtenX) translationX = writtenX
    if (currentY != writtenY) translationY = writtenY
  }

  /** Padding and margin change layout, which only React Native can do, so JS applies them. */
  private fun reportInsets(insets: RectF) {
    if (reported &&
        abs(insets.left - reportedInsets.left) < epsilon &&
        abs(insets.top - reportedInsets.top) < epsilon &&
        abs(insets.right - reportedInsets.right) < epsilon &&
        abs(insets.bottom - reportedInsets.bottom) < epsilon) {
      return
    }
    val sent =
        GSAEvent.dispatch(this, GSAEvent.INSETS_CHANGE) {
          putDouble("top", GSAMetrics.dp(insets.top))
          putDouble("right", GSAMetrics.dp(insets.right))
          putDouble("bottom", GSAMetrics.dp(insets.bottom))
          putDouble("left", GSAMetrics.dp(insets.left))
        }
    if (sent) {
      reported = true
      reportedInsets.set(insets)
    }
  }

  /** `SafeAreaAccessory`: tells JS where the view is drawn, for the region it takes. */
  private fun reportAccessory(frame: RectF) {
    if (accessoryShown &&
        abs(frame.left - reportedAccessory.left) < epsilon &&
        abs(frame.top - reportedAccessory.top) < epsilon &&
        abs(frame.width() - reportedAccessory.width()) < epsilon &&
        abs(frame.height() - reportedAccessory.height()) < epsilon) {
      return
    }
    val sent =
        GSAEvent.dispatch(this, GSAEvent.ACCESSORY_CHANGE) {
          putBoolean("visible", true)
          putDouble("x", GSAMetrics.dp(frame.left))
          putDouble("y", GSAMetrics.dp(frame.top))
          putDouble("width", GSAMetrics.dp(frame.width()))
          putDouble("height", GSAMetrics.dp(frame.height()))
        }
    if (sent) {
      accessoryShown = true
      reportedAccessory.set(frame)
    }
  }

  private companion object {
    /** Edge bits, as in the `edges` prop. */
    const val TOP = 1
    const val RIGHT = 2
    const val BOTTOM = 4
    const val LEFT = 8

    fun regionsFrom(value: ReadableArray?): List<Region> {
      value ?: return emptyList()
      return (0 until value.size()).mapNotNull { i ->
        val map = value.getMap(i) ?: return@mapNotNull null
        val x = PixelUtil.toPixelFromDIP(map.getDouble("x"))
        val y = PixelUtil.toPixelFromDIP(map.getDouble("y"))
        Region(
            frame =
                RectF(
                    x,
                    y,
                    x + PixelUtil.toPixelFromDIP(map.getDouble("width")),
                    y + PixelUtil.toPixelFromDIP(map.getDouble("height")),
                ),
            edge = if (map.hasKey("edge")) map.getInt("edge") else 0,
            side = if (map.hasKey("side")) map.getInt("side") else 0,
            owner = if (map.hasKey("owner")) map.getInt("owner") else 0,
            band = map.hasKey("band") && map.getBoolean("band"),
        )
      }
    }

    /** Reads `{top, right, bottom, left}` in dp into `out`, in pixels, as left, top, right, bottom. */
    fun read(value: ReadableMap?, out: RectF) {
      fun side(name: String) =
          if (value != null && value.hasKey(name) && !value.isNull(name)) {
            PixelUtil.toPixelFromDIP(value.getDouble(name))
          } else {
            0f
          }
      out.set(side("left"), side("top"), side("right"), side("bottom"))
    }
  }
}
