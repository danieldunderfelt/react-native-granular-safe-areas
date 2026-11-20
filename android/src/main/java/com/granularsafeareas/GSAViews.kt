package com.granularsafeareas

import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import androidx.core.widget.NestedScrollView
import com.facebook.react.uimanager.ReactOverflowView
import com.facebook.react.views.scroll.ReactHorizontalScrollView
import com.facebook.react.views.scroll.ReactScrollView
import java.lang.ref.WeakReference

/**
 * Geometry and draw order of Android views.
 *
 * A view's own coordinates are where its children are drawn: their `left` and `top`, minus the view's scroll. A rect
 * in them maps to the parent's through the view's transform (`matrix`), then its `left` and `top`, then the parent's
 * scroll. "Laid out" leaves the transforms out: where layout put things, wherever animations have them for the moment.
 */
internal object GSAViews {
  /**
   * Maps `rect`, in `view`'s own coordinates, to `ancestor`'s. Returns false when `ancestor` isn't above `view` (or is
   * `null`): `rect` is then in the window's coordinates.
   */
  fun mapUp(rect: RectF, view: View, ancestor: View?, laidOut: Boolean): Boolean {
    var current = view
    while (current !== ancestor) {
      if (!laidOut) {
        val matrix = current.matrix
        if (!matrix.isIdentity) matrix.mapRect(rect)
      }
      val parent = current.parent as? View
      rect.offset(
          current.left.toFloat() - (parent?.scrollX ?: 0),
          current.top.toFloat() - (parent?.scrollY ?: 0),
      )
      current = parent ?: return false
    }
    return true
  }

  private val location = IntArray(2)

  /**
   * Maps `rect`, in `view`'s own coordinates, to `space`'s, across windows too: a Modal's content is in a window of its
   * own. Returns false when either of them isn't in a window.
   */
  fun mapTo(rect: RectF, view: View, space: View, laidOut: Boolean): Boolean {
    if (mapUp(rect, view, space, laidOut)) return true
    if (!view.isAttachedToWindow || !space.isAttachedToWindow) return false
    view.rootView.getLocationOnScreen(location)
    rect.offset(location[0].toFloat(), location[1].toFloat())
    val origin = RectF()
    mapUp(origin, space, null, laidOut)
    space.rootView.getLocationOnScreen(location)
    rect.offset(-origin.left - location[0], -origin.top - location[1])
    return true
  }

  /** Whether `view` clips what's drawn inside it to its bounds: a scroll view, `overflow: hidden`, a clipping layout. */
  fun clips(view: View): Boolean =
      when (view) {
        is ScrollView, is HorizontalScrollView, is NestedScrollView -> true
        is ReactOverflowView -> view.overflow.let { it != null && it != "visible" }
        is ViewGroup -> view.clipChildren
        else -> false
      }

  const val VERTICAL = 1
  const val HORIZONTAL = 2

  /** The axes `view` scrolls its content along, if it's a scroll view: 0 when it isn't, or can't scroll. */
  fun scrollAxes(view: View): Int =
      when (view) {
        is ReactScrollView -> if (view.scrollEnabled) VERTICAL else 0
        is ReactHorizontalScrollView -> if (view.scrollEnabled) HORIZONTAL else 0
        is ScrollView, is NestedScrollView -> VERTICAL
        is HorizontalScrollView -> HORIZONTAL
        else -> 0
      }

  private val pagingFields = HashMap<Class<*>, java.lang.reflect.Field?>()

  /** Whether a React Native scroll view pages. Its flag is private, so it's read by reflection; `false` if that fails. */
  fun pagingEnabled(view: View): Boolean {
    if (view !is ReactScrollView && view !is ReactHorizontalScrollView) return false
    val field =
        pagingFields.getOrPut(view.javaClass) {
          var type: Class<*>? = view.javaClass
          var found: java.lang.reflect.Field? = null
          while (type != null && found == null) {
            found =
                try {
                  type.getDeclaredField("pagingEnabled").apply { isAccessible = true }
                } catch (_: Exception) {
                  null
                }
            type = type.superclass
          }
          found
        }
    return try {
      field?.getBoolean(view) == true
    } catch (_: Exception) {
      false
    }
  }

  fun isAncestor(ancestor: View, view: View): Boolean {
    var current = view.parent
    while (current != null) {
      if (current === ancestor) return true
      current = current.parent
    }
    return false
  }

  fun areRelated(view: View, other: View): Boolean =
      view === other || isAncestor(view, other) || isAncestor(other, view)

  private fun windowType(root: View): Int = (root.layoutParams as? WindowManager.LayoutParams)?.type ?: 0

  /**
   * Whether `view` is drawn on top of `other`: in a window above `other`'s (a Modal over the activity), or, in the same
   * window, after it where their branches meet: higher Z (elevation), then later among the children. Neither one may
   * contain the other.
   */
  fun isDrawnAbove(view: View, other: View): Boolean {
    if (!view.isAttachedToWindow || !other.isAttachedToWindow) return false
    val root = view.rootView
    val otherRoot = other.rootView
    if (root !== otherRoot) return windowType(root) > windowType(otherRoot)
    if (areRelated(view, other)) return false
    val otherChain = ArrayList<View>()
    var walk: View? = other
    while (walk != null) {
      otherChain.add(walk)
      walk = walk.parent as? View
    }
    var below: View = view
    var current = view.parent as? ViewGroup
    while (current != null) {
      val index = otherChain.indexOf(current)
      if (index > 0) {
        val otherBelow = otherChain[index - 1]
        if (below.z != otherBelow.z) return below.z > otherBelow.z
        return current.indexOfChild(below) > current.indexOfChild(otherBelow)
      }
      below = current
      current = current.parent as? ViewGroup
    }
    return false
  }
}

/**
 * The views that draw app UI with a region of its own (`SafeAreaAccessory`), by the owner id JS gave them, so views can
 * tell whether it's drawn on top of them.
 */
internal object GSAOwners {
  private val views = HashMap<Int, WeakReference<View>>()

  fun register(ownerId: Int, view: View) {
    if (ownerId != 0) views[ownerId] = WeakReference(view)
  }

  fun unregister(ownerId: Int, view: View) {
    if (ownerId != 0 && views[ownerId]?.get() === view) views.remove(ownerId)
  }

  fun view(ownerId: Int): View? = if (ownerId != 0) views[ownerId]?.get() else null
}
