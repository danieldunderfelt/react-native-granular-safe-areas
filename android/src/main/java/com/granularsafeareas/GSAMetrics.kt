package com.granularsafeareas

import android.app.Activity
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.view.RoundedCorner
import android.view.View
import android.view.WindowInsets
import androidx.core.graphics.Insets
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.uimanager.PixelUtil
import org.json.JSONArray
import org.json.JSONObject

/**
 * The metrics `GranularSafeAreaMetrics` describes, for a view: its size and insets, and what the system draws where,
 * in the view's coordinates, in dp. The JS side builds the regions from them; see `src/android.ts`.
 */
internal object GSAMetrics {
  private val BARS = WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars()
  private val CAPTION = WindowInsetsCompat.Type.captionBar()
  private val CUTOUT = WindowInsetsCompat.Type.displayCutout()

  /** What a regular safe area avoids: the same types as react-native-safe-area-context. */
  private val SAFE_AREA = BARS or CAPTION or CUTOUT

  /** `APPEARANCE_TRANSPARENT_CAPTION_BAR_BACKGROUND`, API 35. */
  private const val TRANSPARENT_CAPTION = 1 shl 7

  /** Everything the metrics depend on, to tell cheaply whether they may have changed. */
  data class Inputs(
      val insets: WindowInsets?,
      val frame: RectF,
      val windowWidth: Int,
      val windowHeight: Int,
      val folds: Int,
      val appearance: Int,
      val rtl: Boolean,
  )

  /** Where `view` is laid out in its window, in pixels. */
  fun frameInWindow(view: View): RectF {
    val frame = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat())
    GSAViews.mapUp(frame, view, null, laidOut = true)
    return frame
  }

  fun inputs(view: View): Inputs {
    val root = view.rootView
    return Inputs(
        insets = root.rootWindowInsets,
        frame = frameInWindow(view),
        windowWidth = root.width,
        windowHeight = root.height,
        folds = GSAFolds.version,
        appearance = appearance(view),
        rtl = view.layoutDirection == View.LAYOUT_DIRECTION_RTL,
    )
  }

  private fun appearance(view: View): Int =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        view.windowInsetsController?.systemBarsAppearance ?: 0
      } else {
        0
      }

  /** The metrics for `view`, or `null` while it isn't laid out in a window. */
  fun forView(view: View, activity: Activity?): JSONObject? {
    if (!view.isAttachedToWindow || view.width == 0 || view.height == 0) return null
    val root = view.rootView
    val raw = root.rootWindowInsets ?: return null
    val insets = WindowInsetsCompat.toWindowInsetsCompat(raw, root)
    val frame = frameInWindow(view)
    val windowWidth = root.width.toFloat()
    val windowHeight = root.height.toFloat()
    val width = view.width.toFloat()
    val height = view.height.toFloat()

    // The part of an inset (from the window's edges) that reaches into the view.
    fun overlap(i: Insets) =
        JSONObject()
            .put("top", dp((i.top - frame.top).coerceIn(0f, height)))
            .put("right", dp((frame.right - (windowWidth - i.right)).coerceIn(0f, width)))
            .put("bottom", dp((frame.bottom - (windowHeight - i.bottom)).coerceIn(0f, height)))
            .put("left", dp((i.left - frame.left).coerceIn(0f, width)))

    // A rect in the window, in the view's coordinates.
    fun local(rect: Rect) =
        rectJSON(
            RectF(rect).apply { offset(-frame.left, -frame.top) },
        )

    val statusTop = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
    val statusBar = if (statusTop > 0) local(Rect(0, 0, root.width, statusTop)) else null

    val window = Rect(0, 0, root.width, root.height)
    val occlusions = JSONArray()
    insets.displayCutout?.boundingRects?.forEach { rect ->
      if (Rect.intersects(rect, window)) occlusions.put(local(rect).put("active", true))
    }

    val divisions = JSONArray()
    if (activity != null) {
      val offset = windowOffset(activity, root)
      for (fold in GSAFolds.current(activity)) {
        val bounds = Rect(fold.bounds).apply { offset(offset[0], offset[1]) }
        divisions.put(local(bounds).put("active", fold.active))
      }
    }

    // The window buttons in a caption bar (desktop windowing), which the platform reports from API 35.
    val systemBars = JSONArray()
    if (Build.VERSION.SDK_INT >= 35) {
      for (rect in raw.getBoundingRects(WindowInsets.Type.captionBar())) {
        if (!rect.isEmpty) systemBars.put(local(rect))
      }
    }

    val bounds = RectF(0f, 0f, width, height)
    val corners = JSONArray()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      for (position in CORNERS) {
        val corner = raw.getRoundedCorner(position) ?: continue
        val r = corner.radius.toFloat()
        if (r <= 0f) continue
        val cx = corner.center.x.toFloat()
        val cy = corner.center.y.toFloat()
        val square =
            when (position) {
              RoundedCorner.POSITION_TOP_LEFT -> RectF(cx - r, cy - r, cx, cy)
              RoundedCorner.POSITION_TOP_RIGHT -> RectF(cx, cy - r, cx + r, cy)
              RoundedCorner.POSITION_BOTTOM_RIGHT -> RectF(cx, cy, cx + r, cy + r)
              else -> RectF(cx - r, cy, cx, cy + r)
            }
        square.offset(-frame.left, -frame.top)
        if (square.intersect(bounds)) corners.put(rectJSON(square))
      }
    }

    val android =
        JSONObject()
            .put("bars", overlap(insets.getInsets(BARS)))
            .put("caption", overlap(insets.getInsets(CAPTION)))
            .put("cutout", overlap(insets.getInsets(CUTOUT)))
            .put("captionTransparent", appearance(view) and TRANSPARENT_CAPTION != 0)
            .put("corners", corners)

    return JSONObject()
        .put("platform", "android")
        .put("width", dp(width))
        .put("height", dp(height))
        .put("insets", overlap(insets.getInsets(SAFE_AREA)))
        .put("verticalBarEdge", JSONObject.NULL)
        .put("layoutDirection", if (view.layoutDirection == View.LAYOUT_DIRECTION_RTL) "rtl" else "ltr")
        .put("statusBar", statusBar ?: JSONObject.NULL)
        .put("barRegionInsets", JSONObject.NULL)
        .put("occlusions", occlusions)
        .put("divisions", divisions)
        .put("systemBars", systemBars)
        .put("barContainersVisible", false)
        .put("barItemsKnown", false)
        .put("reservedRegionsSupported", false)
        .put("android", android)
  }

  private val CORNERS =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        intArrayOf(
            RoundedCorner.POSITION_TOP_LEFT,
            RoundedCorner.POSITION_TOP_RIGHT,
            RoundedCorner.POSITION_BOTTOM_RIGHT,
            RoundedCorner.POSITION_BOTTOM_LEFT,
        )
      } else {
        IntArray(0)
      }

  /** How far `root`'s window is from the activity's on screen: folds are in the activity window's coordinates. */
  private fun windowOffset(activity: Activity, root: View): IntArray {
    val decor = activity.window?.decorView ?: return intArrayOf(0, 0)
    if (decor === root) return intArrayOf(0, 0)
    val a = IntArray(2)
    val b = IntArray(2)
    decor.getLocationOnScreen(a)
    root.getLocationOnScreen(b)
    return intArrayOf(a[0] - b[0], a[1] - b[1])
  }

  fun dp(px: Float): Double = Math.round(PixelUtil.toDIPFromPixel(px) * 1000.0) / 1000.0

  private fun rectJSON(rect: RectF) =
      JSONObject()
          .put("x", dp(rect.left))
          .put("y", dp(rect.top))
          .put("width", dp(rect.width()))
          .put("height", dp(rect.height()))

  // Diagnostics

  private val TYPES =
      linkedMapOf(
          "statusBars" to WindowInsetsCompat.Type.statusBars(),
          "navigationBars" to WindowInsetsCompat.Type.navigationBars(),
          "captionBar" to WindowInsetsCompat.Type.captionBar(),
          "displayCutout" to WindowInsetsCompat.Type.displayCutout(),
          "systemGestures" to WindowInsetsCompat.Type.systemGestures(),
          "mandatorySystemGestures" to WindowInsetsCompat.Type.mandatorySystemGestures(),
          "tappableElement" to WindowInsetsCompat.Type.tappableElement(),
          "ime" to WindowInsetsCompat.Type.ime(),
      )

  private fun insetsJSON(i: Insets) =
      JSONObject().put("top", i.top).put("right", i.right).put("bottom", i.bottom).put("left", i.left)

  private fun pxRect(rect: Rect) =
      JSONObject().put("left", rect.left).put("top", rect.top).put("right", rect.right).put("bottom", rect.bottom)

  /** Everything the platform reports about the activity's window, raw, in pixels, for bug reports and new devices. */
  fun diagnostics(activity: Activity?): JSONObject {
    val out =
        JSONObject()
            .put("platform", "android")
            .put("sdk", Build.VERSION.SDK_INT)
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("density", PixelUtil.toPixelFromDIP(1f).toDouble())
    val decor = activity?.window?.decorView ?: return out.put("window", JSONObject.NULL)
    val raw = decor.rootWindowInsets ?: return out.put("window", JSONObject.NULL)
    val insets = WindowInsetsCompat.toWindowInsetsCompat(raw, decor)
    val types = JSONObject()
    for ((name, type) in TYPES) {
      // The IME has no maximum insets to ask for.
      val ignoringVisibility =
          try {
            insetsJSON(insets.getInsetsIgnoringVisibility(type))
          } catch (_: IllegalArgumentException) {
            JSONObject.NULL
          }
      types.put(
          name,
          JSONObject()
              .put("insets", insetsJSON(insets.getInsets(type)))
              .put("ignoringVisibility", ignoringVisibility)
              .put("visible", insets.isVisible(type)),
      )
    }
    val cutout =
        insets.displayCutout?.let { c ->
          JSONObject()
              .put(
                  "safeInsets",
                  JSONObject()
                      .put("top", c.safeInsetTop)
                      .put("right", c.safeInsetRight)
                      .put("bottom", c.safeInsetBottom)
                      .put("left", c.safeInsetLeft),
              )
              .put("boundingRects", JSONArray(c.boundingRects.map(::pxRect)))
        }
    val caption = JSONArray()
    if (Build.VERSION.SDK_INT >= 35) {
      raw.getBoundingRects(WindowInsets.Type.captionBar()).forEach { caption.put(pxRect(it)) }
    }
    val corners = JSONObject()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      for (position in CORNERS) {
        val corner = raw.getRoundedCorner(position) ?: continue
        corners.put(
            position.toString(),
            JSONObject().put("radius", corner.radius).put("centerX", corner.center.x).put("centerY", corner.center.y),
        )
      }
    }
    val folds = JSONArray()
    for (fold in GSAFolds.current(activity)) {
      folds.put(
          pxRect(fold.bounds)
              .put("state", fold.state)
              .put("orientation", fold.orientation)
              .put("occlusion", fold.occlusion)
              .put("separating", fold.separating)
              .put("active", fold.active),
      )
    }
    val appearance =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          decor.windowInsetsController?.systemBarsAppearance ?: 0
        } else {
          0
        }
    return out.put(
        "window",
        JSONObject()
            .put("width", decor.width)
            .put("height", decor.height)
            .put("types", types)
            .put("cutout", cutout ?: JSONObject.NULL)
            .put("captionBarBoundingRects", caption)
            .put("roundedCorners", corners)
            .put("folds", folds)
            .put("systemBarsAppearance", appearance)
            .put("captionTransparent", appearance and TRANSPARENT_CAPTION != 0)
            .put("metrics", forView(decor, activity) ?: JSONObject.NULL),
    )
  }
}
