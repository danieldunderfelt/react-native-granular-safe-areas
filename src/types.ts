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
 * What occupies a region. The kinds describe what's there, not which device it's on.
 *
 * - `status`: the status bar and what's in it: time, signal, battery. On the iPhone Duo, the whole status cluster.
 * - `cutout`: a camera or sensor housing outside the bands: a punch-hole, the Dynamic Island, the iPhone Duo's camera.
 * - `controls`: controls drawn over the app: UIKit's navigation, tab and tool bars and the iPhone Duo's vertical bar
 *   items, the window controls of an iPad window, the window buttons of an Android caption bar, the system back
 *   button. They follow the bars as they grow, shrink, appear and disappear.
 * - `accessory`: app UI floating over the content, marked with `SafeAreaAccessory`: a boarding pass button, a mini
 *   player, a tab bar drawn in JS.
 * - `fold`: an active fold or hinge of a foldable display.
 * - `inset`: a whole safe-area inset band the platform didn't break down further, avoided as a whole, like a regular
 *   safe area.
 */
export type SafeAreaRegionKind =
  'inset' | 'status' | 'cutout' | 'controls' | 'accessory' | 'fold';

/** A rectangle the OS or the app draws over, in the provider's coordinate space. */
export type SafeAreaRegion = {
  kind: SafeAreaRegionKind;
  /**
   * The screen edge the region hugs. An overlapping element moves away from this edge. `null` means the region
   * floats (a fold, or a camera that touches no edge); the element then moves in the cheapest allowed direction.
   */
  edge: Edge | null;
  /**
   * For a region in a corner, such as the window controls of an iPad window: the other edge it hugs. An element moves
   * away from `edge` (below the controls) unless that takes more than half of its height there, as for a header level
   * with the controls. Then it moves away from `side` instead, the way a toolbar's items move over.
   */
  side?: Edge;
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
  /** Where the facts come from. Each platform has its own way of breaking the bands down. */
  platform: 'ios' | 'android' | 'web';
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
  /**
   * iPad: the window controls (close, minimize, arrange) in the top corner of a window that doesn't fill the screen,
   * with the system's margins around them. From the corner-adapted safe area (iOS 26+). Absent or `null` otherwise.
   */
  windowControls?: Rect | null;
  /**
   * iOS: the edge where UIKit actually laid out a visible tab bar (`UITabBar` or floating tab platter), when one is
   * present. Absent when no UIKit tab bar is visible or on other platforms.
   */
  tabBarEdge?: Edge;
  /** Device idiom (`'phone'` or `'pad'`). Reported on iOS and Android (`smallestScreenWidthDp >= 600`). */
  idiom?: 'phone' | 'pad';
  /** iOS: the provider's horizontal size class. On an iPad, UIKit puts a tab bar at the top when it's regular. */
  horizontalSizeClass?: 'compact' | 'regular';
  /** Hardware model identifier reported by the native side (e.g. `'iPhone19,4'`, `'Google Pixel 10'`). */
  deviceModel?: string;
  /** OS version reported by the native side (e.g. `'27.2'` on iOS, `'37'` on Android). */
  systemVersion?: string;
  /** Android: what each inset is made of, to break the bands down. Absent elsewhere. */
  android?: AndroidInsetSources;
};

/** Android: the parts of the provider's insets, by what the system draws there, in the provider's coordinate space. */
export type AndroidInsetSources = {
  /** The status and navigation bars. */
  bars: EdgeInsets;
  /** The caption bar: the title bar of a window in desktop windowing. Its window buttons are in `systemBars`. */
  caption: EdgeInsets;
  /** The display cutout. Its camera housings are in `occlusions`. */
  cutout: EdgeInsets;
  /**
   * Whether the app draws the caption bar's background itself (`APPEARANCE_TRANSPARENT_CAPTION_BAR_BACKGROUND`), so
   * only the window buttons in it cover the app.
   */
  captionTransparent: boolean;
  /** The display's rounded corners inside the provider: a square the size of each corner's radius. */
  corners: Rect[];
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
  /**
   * Keep avoiding regions on a scroll view's scrolling edges (`left`/`right` in a horizontal scroll view,
   * `top`/`bottom` in a vertical scroll view) instead of leaving them to the scroll view's content inset. Useful for
   * cards in a horizontal carousel that should avoid a side column. For `dynamic` views whose active `edges` all lie
   * on the scrolling axis (e.g. `edges={['right']}` in a horizontal carousel), scrolling edges are avoided
   * automatically. Defaults to `false`.
   */
  avoidScrollingEdges?: boolean;
};

/** Which way the scroll views around an element scroll. */
export type ScrollAxes = { vertical: boolean; horizontal: boolean };
