import type { Edge, EdgeInsets, Rect } from 'react-native-safe-area-context';

export type { Edge, EdgeInsets, Rect };

/**
 * What occupies a region.
 *
 * - `inset`: a whole safe-area inset band the library could not break down any further. Same as a regular safe area.
 * - `status`: the status cluster. The status bar plus the camera and Dynamic Island next to it.
 * - `camera`: a camera or other occlusion outside the bands.
 * - `systemBar`: a UIKit bar drawn over the app: the iPhone Duo vertical tab bar or toolbar, or a navigation, tab or
 *   tool bar elsewhere. It follows the bar as it grows, shrinks, appears and disappears.
 * - `fold`: an active fold (a division) of a foldable display.
 */
export type SafeAreaRegionKind =
  'inset' | 'status' | 'camera' | 'systemBar' | 'fold';

/** A rectangle the OS draws over, in the provider's coordinate space. */
export type SafeAreaRegion = {
  kind: SafeAreaRegionKind;
  /**
   * The screen edge the region hugs. An overlapping element moves away from this edge. `null` means the region
   * floats (a fold, or a camera that touches no edge); the element then moves in the cheapest allowed direction.
   */
  edge: Edge | null;
  frame: Rect;
};

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
   * Frames of the visible UIKit bars (tab bars, toolbars, navigation bars, vertical bar containers) in the provider's
   * presentation: the view controller hierarchy it is shown in, not other sheets or modals.
   */
  systemBars: Rect[];
  /**
   * Whether a UIKit container that can put bars in the vertical column is visible: a tab bar controller, or a
   * navigation controller with its navigation bar or toolbar showing.
   */
  barContainersVisible: boolean;
  /** Whether the runtime and the SDK the app was built with support reserved regions (iOS 27.1+). */
  reservedRegionsSupported: boolean;
};

export type GranularSafeAreaMode = 'padding' | 'offset';

/** Options shared by the automatic and the manual APIs. */
export type GranularInsetsOptions = {
  /** Edges the element may be pushed in from. Defaults to all four. */
  edges?: readonly Edge[];
  /** Region kinds to avoid. Defaults to everything except `fold`. Pass `[]` to avoid nothing. */
  avoid?: readonly SafeAreaRegionKind[];
  /** Extra clearance between the element's content and a region, in points. Defaults to 0. */
  spacing?: number;
  /**
   * Set this for elements inside a scroll view. Content that scrolls passes under every region on the cross-axis
   * edges, so those regions apply along the whole axis, like a regular safe area. Regions on the scrolling edges are
   * ignored: handle them with the scroll view's content inset.
   */
  scrollable?: 'vertical' | 'horizontal';
};

/** Options for the automatic APIs, which measure the element and apply the insets themselves. */
export type GranularSafeAreaOptions = GranularInsetsOptions & {
  /**
   * `padding` (default) keeps the element's box and background where they are and pushes its children in. Use it for
   * containers whose size comes from their parent, like headers and bottom bars.
   * `offset` moves the whole element with a transform. Use it for floating buttons and badges.
   */
  mode?: GranularSafeAreaMode;
};
