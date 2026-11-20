import type {
  Edge,
  EdgeInsets,
  EdgeMode,
  EdgeRecord,
  Edges,
  Rect,
} from 'react-native-safe-area-context';

export type { Edge, EdgeInsets, EdgeMode, EdgeRecord, Edges, Rect };

/**
 * What occupies a region.
 *
 * - `inset`: a whole safe-area inset band the library could not break down any further. Same as a regular safe area.
 * - `status`: the status cluster. The status bar plus the camera and Dynamic Island next to it.
 * - `camera`: a camera or other occlusion outside the bands.
 * - `systemBar`: a UIKit bar drawn over the app: the iPhone Duo vertical tab bar or toolbar, or a navigation, tab or
 *   tool bar elsewhere. It follows the bar as it grows, shrinks, appears and disappears.
 * - `accessory`: app UI floating over the content, marked with `SafeAreaAccessory`: a boarding pass button, a mini
 *   player, a tab bar drawn in JS.
 * - `fold`: an active fold (a division) of a foldable display.
 */
export type SafeAreaRegionKind =
  'inset' | 'status' | 'camera' | 'systemBar' | 'accessory' | 'fold';

/** A rectangle the OS or the app draws over, in the provider's coordinate space. */
export type SafeAreaRegion = {
  kind: SafeAreaRegionKind;
  /**
   * The screen edge the region hugs. An overlapping element moves away from this edge. `null` means the region
   * floats (a fold, or a camera that touches no edge); the element then moves in the cheapest allowed direction.
   */
  edge: Edge | null;
  frame: Rect;
  /**
   * The view that draws it, for app UI: bars, accessories, the vertical bar back button. Such a region only covers
   * what's drawn beneath it, so a sheet or modal on top of it ignores it. System UI (the status bar, cameras, the
   * home indicator) has no owner: it's drawn on top of everything.
   */
  owner?: number;
};

/** A UIKit bar the platform reports, and the view that draws it. */
export type SystemBarFrame = Rect & { owner?: number };

export type ReservedRegionFrame = Rect & { active: boolean };

/**
 * Raw facts the platform reports for one provider, in the provider's coordinate space. The JS side turns these into
 * {@link SafeAreaRegion}s, so all of the decision logic lives in one testable place.
 */
export type GranularSafeAreaMetrics = {
  width: number;
  height: number;
  /** The regular safe-area insets of the provider. */
  insets: EdgeInsets;
  /** UIKit's `verticalBarEdge` trait. It names the edge the system prefers for its vertical bars, if any. */
  verticalBarEdge: 'leading' | 'trailing' | null;
  layoutDirection: 'ltr' | 'rtl';
  /** `UIStatusBarManager.statusBarFrame`. `null` when the status bar is hidden. */
  statusBar: Rect | null;
  /** `edgeInsets(for: .bar(onEdge:extent:))` for a bar on the vertical bar edge. */
  barRegionInsets: EdgeInsets | null;
  /** `UIView.reservedRegions(kind: .occlusion)`, including inactive regions. */
  occlusions: ReservedRegionFrame[];
  /** `UIView.reservedRegions(kind: .division)`, including inactive regions. */
  divisions: ReservedRegionFrame[];
  /**
   * Frames of the visible UIKit bars in the provider's presentation (the view controller hierarchy it is shown in,
   * not other sheets or modals): navigation bars, toolbars and tab bars, and each item group UIKit draws in a floating
   * bar container, such as the back button, header items or the tab bar platter in the iPhone Duo's vertical bar.
   */
  systemBars: SystemBarFrame[];
  /**
   * Whether a UIKit container that can put bars in the vertical column is visible: a tab bar controller, or a
   * navigation controller with its navigation bar or toolbar showing.
   */
  barContainersVisible: boolean;
  /**
   * Whether the native side found the floating bar containers UIKit draws bar items in (iOS 26+). When it did,
   * `systemBars` lists every item in the vertical bar, including none at all.
   */
  barItemsKnown: boolean;
  /** Whether the runtime and the SDK the app was built with support reserved regions (iOS 27.1+). */
  reservedRegionsSupported: boolean;
};

/**
 * How a `SafeAreaView` applies its insets.
 *
 * - `padding` (default): the children move in; the view's box and background stay. For views sized by their parent.
 * - `margin`: the view's box moves in, and so does whatever is laid out next to it.
 * - `offset`: the whole view moves, with a transform on top of its own. For floating buttons, badges and anything
 *   sized by its content. On iOS it's applied natively, in the same frame.
 * - `none`: nothing is applied; read the insets with `onInsetsChange`.
 */
export type GranularSafeAreaMode = 'padding' | 'margin' | 'offset' | 'none';

/** Options shared by `SafeAreaView` and `useSafeAreaInsetsFor`. */
export type GranularInsetsOptions = {
  /** Region kinds to avoid. Defaults to everything except `fold`. Pass `[]` to avoid nothing. */
  avoid?: readonly SafeAreaRegionKind[];
  /** Extra clearance between the element and a region, in points. Defaults to 0. */
  spacing?: number;
  /**
   * Avoid only the regions the element overlaps where it's laid out (the status cluster, a camera, a bar), instead of
   * the whole inset band on each edge it overlaps. For fixed UI. In a scroll view, where the element's position along
   * the scroll axis isn't fixed, it avoids whole bands anyway; use `dynamic` there. Defaults to `false`.
   */
  granular?: boolean;
};

/** Which way the scroll views around an element scroll. */
export type ScrollAxes = { vertical: boolean; horizontal: boolean };
