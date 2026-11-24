import { buildAndroidRegions, getAndroidSystemControls } from './android';
import type {
  Edge,
  EdgeInsets,
  EdgeMode,
  Edges,
  GranularSafeAreaMetrics,
  Rect,
  SafeAreaRegion,
  SafeAreaRegionKind,
  ScrollAxes,
  SystemBarFrame,
} from './types';

export const EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

export const DEFAULT_AVOID: readonly SafeAreaRegionKind[] = [
  'inset',
  'status',
  'cutout',
  'controls',
  'accessory',
];

export const ZERO_INSETS: EdgeInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const OPPOSITE: Record<Edge, Edge> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

const maxX = (r: Rect) => r.x + r.width;
const maxY = (r: Rect) => r.y + r.height;

/** True when the two rectangles share a positive area. Touching edges don't count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < maxX(b) && b.x < maxX(a) && a.y < maxY(b) && b.y < maxY(a);
}

function contains(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    maxX(inner) <= maxX(outer) + tolerance &&
    maxY(inner) <= maxY(outer) + tolerance
  );
}

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(maxX(a), maxX(b)) - x;
  const height = Math.min(maxY(a), maxY(b)) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function expand(r: Rect, by: number): Rect {
  return {
    x: r.x - by,
    y: r.y - by,
    width: r.width + by * 2,
    height: r.height + by * 2,
  };
}

/** The full-length band a safe-area inset covers on one edge. */
function bandRect(
  edge: Edge,
  size: number,
  width: number,
  height: number
): Rect {
  switch (edge) {
    case 'top':
      return { x: 0, y: 0, width, height: size };
    case 'bottom':
      return { x: 0, y: height - size, width, height: size };
    case 'left':
      return { x: 0, y: 0, width: size, height };
    case 'right':
      return { x: width - size, y: 0, width: size, height };
  }
}

/**
 * The edge a region hugs: one it touches, or whose inset band it sits against (a navigation bar right below the
 * status bar), preferring the edge it extends least from. A camera in the top-right corner that is wider than tall
 * hugs the top, so an element under it moves down, which is the shorter way out.
 */
function attachedEdge(
  frame: Rect,
  width: number,
  height: number,
  insets: EdgeInsets = ZERO_INSETS
): Edge | null {
  const tolerance = 1;
  const touching: [Edge, number][] = [];
  if (frame.y <= insets.top + tolerance) touching.push(['top', frame.height]);
  if (maxX(frame) >= width - insets.right - tolerance)
    touching.push(['right', frame.width]);
  if (maxY(frame) >= height - insets.bottom - tolerance)
    touching.push(['bottom', frame.height]);
  if (frame.x <= insets.left + tolerance) touching.push(['left', frame.width]);
  // Spanning a whole axis (a full-width navigation bar) says nothing about which of its two edges to move away from.
  const has = (edge: Edge) => touching.some(([e]) => e === edge);
  const spansX = has('left') && has('right');
  const spansY = has('top') && has('bottom');
  const candidates = touching.filter(
    ([edge]) =>
      !(
        ((edge === 'left' || edge === 'right') && spansX) ||
        ((edge === 'top' || edge === 'bottom') && spansY)
      )
  );
  candidates.sort((a, b) => a[1] - b[1]);
  if (candidates[0]) return candidates[0][0];
  // A full-width bar that doesn't touch the top or bottom still belongs to the nearer one. On the iPhone Duo the
  // navigation bar starts 24 pt down although the top inset is 0, and it's still a top bar.
  if (spansX && !spansY)
    return frame.y + frame.height / 2 <= height / 2 ? 'top' : 'bottom';
  if (spansY && !spansX)
    return frame.x + frame.width / 2 <= width / 2 ? 'left' : 'right';
  return null;
}

/**
 * The physical edge that holds the system's vertical bars, if any.
 *
 * UIKit reports the edge as leading/trailing, but Apple says the bars stay on the same physical side in right-to-left
 * languages. So when the edge the trait maps to has no inset and the opposite one does, the inset wins.
 */
export function resolveVerticalBarEdge(
  metrics: GranularSafeAreaMetrics
): 'left' | 'right' | null {
  if (!metrics.verticalBarEdge) return null;
  const rtl = metrics.layoutDirection === 'rtl';
  const mapped: 'left' | 'right' =
    (metrics.verticalBarEdge === 'trailing') !== rtl ? 'right' : 'left';
  const other = OPPOSITE[mapped] as 'left' | 'right';
  if (metrics.insets[mapped] <= 0 && metrics.insets[other] > 0) return other;
  return metrics.insets[mapped] > 0 ? mapped : null;
}

export type BuildRegionsOptions = {
  /**
   * Break the bands down into the regions actually inside them where the platform allows it, such as the iPhone Duo's
   * vertical bar band. When `false`, every band stays whole, as in a regular safe area. Defaults to `true`.
   */
  granular?: boolean;
};

/**
 * Turns raw platform metrics into the regions elements should avoid.
 *
 * Each non-zero safe-area inset starts as a full-length band. The band that holds the system's vertical bars is
 * replaced by the regions inside it only when the platform reports where the status cluster ends. Otherwise it stays
 * whole, so a device the library doesn't understand behaves exactly like a regular safe area.
 */
export function buildRegions(
  metrics: GranularSafeAreaMetrics,
  { granular = true }: BuildRegionsOptions = {}
): SafeAreaRegion[] {
  if (metrics.platform === 'android') {
    return buildAndroidRegions(metrics, { granular });
  }
  const { width, height, insets } = metrics;
  const barEdge =
    granular && metrics.reservedRegionsSupported
      ? resolveVerticalBarEdge(metrics)
      : null;

  const regions: SafeAreaRegion[] = [];
  const inColumn = new Set<Rect>();
  for (const edge of EDGES) {
    const size = insets[edge];
    if (size <= 0) continue;
    const band = bandRect(edge, size, width, height);
    const refined = edge === barEdge ? refineBand(edge, band, metrics) : null;
    if (refined) refined.bars.forEach((bar) => inColumn.add(bar));
    regions.push(
      ...(refined?.regions ?? [{ kind: 'inset', edge, frame: band }])
    );
  }

  // Anything inside a band (the Dynamic Island in the top inset, the Duo camera in its status cluster, a vertical bar
  // in a whole band) is already avoided through that band.
  const covered = (frame: Rect) =>
    regions.some((region) => contains(region.frame, frame));
  const bounds = { x: 0, y: 0, width, height };

  for (const occlusion of metrics.occlusions) {
    if (!occlusion.active || covered(occlusion)) continue;
    const frame = rectOf(occlusion);
    regions.push({
      kind: 'cutout',
      edge: attachedEdge(frame, width, height),
      frame,
    });
  }

  // Bars outside a refined column, such as a navigation bar over a screen with a transparent header, are regions of
  // their own. They follow the bar as it grows and shrinks.
  for (const bar of metrics.systemBars) {
    if (inColumn.has(bar)) continue;
    const frame = intersection(bar, bounds);
    if (!frame || covered(frame)) continue;
    regions.push({
      kind: 'controls',
      edge: attachedEdge(frame, width, height, insets),
      frame,
      ...ownerOf(bar),
    });
  }

  // The window controls in the top corner of an iPad window. A header level with them moves over; anything taller
  // moves below them.
  const controls =
    metrics.windowControls && intersection(metrics.windowControls, bounds);
  if (controls && !covered(controls)) {
    regions.push({
      kind: 'controls',
      edge: 'top',
      side: controls.x + controls.width / 2 <= width / 2 ? 'left' : 'right',
      frame: controls,
    });
  }

  for (const division of metrics.divisions) {
    if (!division.active) continue;
    regions.push({ kind: 'fold', edge: null, frame: rectOf(division) });
  }

  return regions;
}

/**
 * Splits the vertical bar band into the status cluster at the top and the system bars below it. Returns `null`, which
 * keeps the band whole, unless the metrics account for everything in the band:
 *
 * - The cluster's end must come from a source that knows about the status bar: its frame, or the bar layout region.
 *   A camera region alone can stop above the time and signal icons.
 * - When UIKit containers with bars are visible, at least one vertical bar must have been found in the band.
 *   Otherwise the system put something there the native side didn't recognize.
 *
 * Each region spans the band's full width: the cluster's exact horizontal extent isn't known, and the band is narrow.
 */
function refineBand(
  edge: Edge,
  band: Rect,
  metrics: GranularSafeAreaMetrics
): { regions: SafeAreaRegion[]; bars: Rect[] } | null {
  const clusterBottom = statusClusterBottom(band, metrics);
  if (clusterBottom === null) return null;

  const verticalBars = columnBars(band, metrics);
  // Without the floating bar containers, a visible bar container with no bar found in the column means the system
  // put something there the native side didn't recognize.
  if (
    metrics.barContainersVisible &&
    !metrics.barItemsKnown &&
    verticalBars.length === 0
  ) {
    return null;
  }

  const regions: SafeAreaRegion[] =
    clusterBottom > 0
      ? [
          {
            kind: 'status',
            edge,
            frame: {
              x: band.x,
              y: band.y,
              width: band.width,
              height: clusterBottom,
            },
          },
        ]
      : [];
  for (const bar of verticalBars) {
    const clipped = intersection(bar, band);
    if (!clipped) continue;
    regions.push({
      kind: 'controls',
      edge,
      frame: {
        x: band.x,
        y: clipped.y,
        width: band.width,
        height: clipped.height,
      },
      ...ownerOf(bar),
    });
  }
  return { regions, bars: verticalBars };
}

/**
 * Where the status cluster at the top of the vertical bar band ends, or `null` when nothing that knows about the
 * status bar says so. A camera region alone can stop above the time and signal icons, so it only ever extends the
 * cluster, e.g. a Dynamic Island grown by a Live Activity.
 */
function statusClusterBottom(
  band: Rect,
  metrics: GranularSafeAreaMetrics
): number | null {
  const statusBottoms: number[] = [];
  const { statusBar } = metrics;
  // A vertical status bar reports a placeholder frame (466 x 2 pt at the top on the Duo), which says nothing.
  if (
    statusBar &&
    statusBar.width >= 10 &&
    statusBar.height >= 10 &&
    overlaps(statusBar, band)
  ) {
    statusBottoms.push(maxY(statusBar));
  }
  // 0 is a real answer: a view below the status cluster, such as a sheet, has nothing above its bar items.
  const barTop = metrics.barRegionInsets?.top;
  if (barTop !== undefined && barTop >= 0) statusBottoms.push(barTop);
  if (statusBottoms.length === 0) return null;

  const cameraBottoms = metrics.occlusions
    .filter((o) => o.active && overlaps(o, band))
    .map(maxY);
  return Math.min(Math.max(...statusBottoms, ...cameraBottoms), band.height);
}

/** The bars and bar items in the column: centered in the band and no wider than it. Bars that cross it are not. */
function columnBars(
  band: Rect,
  metrics: GranularSafeAreaMetrics
): SystemBarFrame[] {
  return metrics.systemBars.filter((bar) => {
    const centerX = bar.x + bar.width / 2;
    return (
      bar.width <= band.width + 1 && centerX >= band.x && centerX <= maxX(band)
    );
  });
}

/** The system's vertical bar: the column on one side that holds the status cluster and the bar items. */
export type VerticalBar = {
  /** The physical edge the bar is on. */
  edge: 'left' | 'right';
  /** The whole column, the inset band on that edge, in the provider's coordinates. */
  column: Rect;
  /** Where bar items start: right below the status cluster. */
  top: number;
  /** Where bar items end: above the bottom inset. */
  bottom: number;
  /** The horizontal center of the bar items. On the Duo it lines up with the camera, not with the column. */
  centerX: number;
  /** The bar items UIKit currently shows in the column (back button, header items, tab bar), top to bottom. */
  items: Rect[];
};

/**
 * The vertical bar, if the platform has one where this provider is: the iPhone Duo closed, or open in landscape.
 * `null` everywhere else, and when the native side can't say where the status cluster ends.
 */
export function getVerticalBar(
  metrics: GranularSafeAreaMetrics
): VerticalBar | null {
  if (!metrics.reservedRegionsSupported) return null;
  const edge = resolveVerticalBarEdge(metrics);
  if (!edge) return null;
  const { width, height, insets } = metrics;
  const column = bandRect(edge, insets[edge], width, height);
  const top = statusClusterBottom(column, metrics);
  if (top === null) return null;

  // The bar layout region is where UIKit lays out bar items. It's narrower than the column and centered on the camera.
  let centerX = column.x + column.width / 2;
  const region = metrics.barRegionInsets;
  if (region) {
    const start = region.left;
    const end = width - region.right;
    const center = (start + end) / 2;
    if (end > start && center >= column.x && center <= maxX(column)) {
      centerX = center;
    }
  }
  const items = columnBars(column, metrics)
    .map(rectOf)
    .sort((a, b) => a.y - b.y);
  return {
    edge,
    column,
    top,
    bottom: height - Math.max(insets.bottom, region?.bottom ?? 0),
    centerX,
    items,
  };
}

/**
 * The edge the system puts a tab bar on where these metrics are, whether or not the app shows one: the vertical bar's
 * edge where there is one (the iPhone Duo closed, or open in landscape), the top of an iPad window of regular width,
 * and the bottom everywhere else, Android and the web included. `bottom` without metrics.
 */
export function getTabBarEdge(metrics: GranularSafeAreaMetrics | null): Edge {
  if (metrics?.platform !== 'ios') return 'bottom';
  const vertical = resolveVerticalBarEdge(metrics);
  if (vertical) return vertical;
  if (metrics.idiom === 'pad' && metrics.horizontalSizeClass === 'regular') {
    return 'top';
  }
  return 'bottom';
}

/** The size of a vertical bar button: the glass circle UIKit draws for the back button and bar items. */
export const VERTICAL_BAR_ITEM_SIZE = 48;

/**
 * Where a back button goes in the vertical bar: the top slot, right below the status cluster, where UIKit puts the
 * back button of a navigation controller. `null` without a vertical bar, or when a UIKit bar item already sits there
 * (a native header shows its own back button).
 */
export function verticalBarBackButtonFrame(bar: VerticalBar): Rect | null {
  const size = VERTICAL_BAR_ITEM_SIZE;
  if (bar.bottom - bar.top < size) return null;
  const frame = {
    x: bar.centerX - size / 2,
    y: bar.top,
    width: size,
    height: size,
  };
  return bar.items.some((item) => overlaps(item, frame)) ? null : frame;
}

/**
 * The strip along one edge where the system puts its controls and yours may join: the iPhone Duo's vertical bar, an
 * Android caption bar. What's in it, and where it's free.
 */
export type SystemControls = {
  /** The edge the strip runs along. */
  edge: Edge;
  /** The whole strip: the inset band on that edge. */
  strip: Rect;
  /** What the system has in the strip: the status cluster, its controls, and the end beyond where controls may go. */
  occupied: Rect[];
  /** The stretches of the strip nothing occupies, where your own controls may go, from start to end. */
  free: Rect[];
  /** The size of the system's own controls in the strip. */
  itemSize: number;
  /** The line the system centers its controls on, across the strip: an x for a vertical strip, a y for a horizontal one. */
  center: number;
};

/**
 * The system controls strip where these metrics are, or `null` when there isn't one, or the platform can't say what's
 * in it. `extra` adds controls of your own that sit in the strip, such as the system back button.
 */
export function getSystemControls(
  metrics: GranularSafeAreaMetrics,
  extra: readonly Rect[] = []
): SystemControls | null {
  if (metrics.platform === 'android') {
    return getAndroidSystemControls(metrics, extra);
  }
  const bar = getVerticalBar(metrics);
  if (!bar) return null;
  const { column } = bar;
  const across = (y: number, height: number): Rect => ({
    x: column.x,
    y,
    width: column.width,
    height,
  });
  const occupied: Rect[] = [];
  if (bar.top > column.y) occupied.push(across(column.y, bar.top - column.y));
  for (const item of [...bar.items, ...extra]) {
    const clipped = intersection(item, column);
    if (clipped) occupied.push(across(clipped.y, clipped.height));
  }
  if (bar.bottom < maxY(column))
    occupied.push(across(bar.bottom, maxY(column) - bar.bottom));
  occupied.sort((a, b) => a.y - b.y);

  const free: Rect[] = [];
  let start = column.y;
  for (const taken of occupied) {
    if (taken.y > start) free.push(across(start, taken.y - start));
    start = Math.max(start, maxY(taken));
  }
  if (start < maxY(column)) free.push(across(start, maxY(column) - start));

  return {
    edge: bar.edge,
    strip: rectOf(column),
    occupied,
    free,
    itemSize: VERTICAL_BAR_ITEM_SIZE,
    center: bar.centerX,
  };
}

function ownerOf(bar: SystemBarFrame): { owner?: number } {
  return bar.owner !== undefined ? { owner: bar.owner } : {};
}

function rectOf(r: Rect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function translate(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}

/**
 * Re-expresses metrics measured for a larger view (usually the window) for a sub-rectangle of it, such as a provider
 * that doesn't start at the window's origin. `rect` is in the larger view's coordinates.
 */
export function metricsForSubrect(
  metrics: GranularSafeAreaMetrics,
  rect: Rect
): GranularSafeAreaMetrics {
  const dx = -rect.x;
  const dy = -rect.y;
  const move = (r: Rect) => translate(r, dx, dy);
  // Insets are measured from the larger view's edges: what's left of each inside the sub-rectangle.
  const shift = (i: EdgeInsets): EdgeInsets => ({
    top: Math.max(0, i.top - rect.y),
    left: Math.max(0, i.left - rect.x),
    bottom: Math.max(0, maxY(rect) - (metrics.height - i.bottom)),
    right: Math.max(0, maxX(rect) - (metrics.width - i.right)),
  });
  const clampInsets = (i: EdgeInsets): EdgeInsets => ({
    top: Math.min(i.top, rect.height),
    bottom: Math.min(i.bottom, rect.height),
    left: Math.min(i.left, rect.width),
    right: Math.min(i.right, rect.width),
  });
  const { android } = metrics;
  return {
    ...metrics,
    width: rect.width,
    height: rect.height,
    insets: clampInsets(shift(metrics.insets)),
    statusBar: metrics.statusBar ? move(metrics.statusBar) : null,
    barRegionInsets: metrics.barRegionInsets
      ? shift(metrics.barRegionInsets)
      : null,
    occlusions: metrics.occlusions.map((o) => ({
      ...move(o),
      active: o.active,
    })),
    divisions: metrics.divisions.map((d) => ({ ...move(d), active: d.active })),
    systemBars: metrics.systemBars.map(move),
    windowControls: metrics.windowControls
      ? move(metrics.windowControls)
      : null,
    ...(android && {
      android: {
        ...android,
        bars: clampInsets(shift(android.bars)),
        caption: clampInsets(shift(android.caption)),
        cutout: clampInsets(shift(android.cutout)),
        corners: android.corners.map(move),
      },
    }),
  };
}

/** Metrics with only regular insets, for platforms that report nothing else, such as the web. */
export function metricsFromInsets(
  width: number,
  height: number,
  insets: EdgeInsets,
  platform: GranularSafeAreaMetrics['platform'] = 'web'
): GranularSafeAreaMetrics {
  return {
    platform,
    width,
    height,
    insets,
    verticalBarEdge: null,
    layoutDirection: 'ltr',
    statusBar: null,
    barRegionInsets: null,
    occlusions: [],
    divisions: [],
    systemBars: [],
    barContainersVisible: false,
    barItemsKnown: false,
    reservedRegionsSupported: false,
  };
}

/** Regions on the edges content scrolls towards are the scroll view's content inset's job, not the element's. */
export function withoutScrollingEdges(
  regions: readonly SafeAreaRegion[],
  axis: 'vertical' | 'horizontal'
): SafeAreaRegion[] {
  const scrollingEdges: readonly Edge[] =
    axis === 'vertical' ? ['top', 'bottom'] : ['left', 'right'];
  return regions.flatMap((r) => {
    if (r.edge && scrollingEdges.includes(r.edge)) return [];
    if (r.side && scrollingEdges.includes(r.side)) {
      // A corner region whose other way out is a scrolling edge: the element can only move away from `edge`.
      const { side: _side, ...rest } = r;
      return [rest];
    }
    return [r];
  });
}

/**
 * Stretches scrolling content along the scroll axis, over the whole area it can be seen in (its scroll view). Its
 * position along that axis isn't fixed, so it has to clear everything it can scroll under, and content measured while
 * it's out of view (further down a list) gets the inset it will need once it's on screen.
 */
export function sweepElement(
  rect: Rect,
  axis: 'vertical' | 'horizontal',
  area: Rect
): Rect {
  return axis === 'vertical'
    ? { x: rect.x, y: area.y, width: rect.width, height: area.height }
    : { x: area.x, y: rect.y, width: area.width, height: rect.height };
}

export const NO_SCROLL: ScrollAxes = Object.freeze({
  vertical: false,
  horizontal: false,
});

export type SafeAreaViewInsetsOptions = ElementInsetsOptions & {
  /** The regions, broken down as far as the platform allows. */
  regions: readonly SafeAreaRegion[];
  /** The same, with every inset band whole: what a regular safe area avoids. */
  bands: readonly SafeAreaRegion[];
  granular?: boolean;
  dynamic?: boolean;
  /** The scroll views around the element. */
  scroll?: ScrollAxes;
  /**
   * Whether the app UI drawn by `owner` (a bar, an accessory) is drawn on top of the element. Defaults to yes. System
   * UI has no owner and always is.
   */
  covers?: (owner: number) => boolean;
};

const ALWAYS = () => true;

/**
 * The insets a `SafeAreaView` needs at `element`. It avoids what can cover it: system UI, and app UI drawn on top of
 * it (a sheet ignores the tab bar beneath it). Only where it can be seen counts: `visible`, its clipping ancestors.
 *
 * - By default it avoids whole bands. A band runs the full length of its edge, so the view stays clear of the OS UI
 *   wherever it moves along it. A band only counts if something in it that covers the view reaches where the view can
 *   be seen: on the iPhone Duo, a sheet that starts below the status cluster has nothing to avoid in the column.
 * - `granular` avoids only the regions it overlaps where it is. In a scroll view its position along the scroll axis
 *   isn't fixed, so it avoids whole bands there.
 * - `dynamic` avoids only the regions it overlaps right now; it's measured again whenever it moves.
 *
 * In a scroll view, the regions on the edges it scrolls towards are left to the scroll view's content inset, and a
 * view that isn't dynamic is measured as if it covered the whole visible part of the scroll axis.
 * GSASafeAreaView.mm does the same natively; keep the two in step.
 */
export function safeAreaViewInsets(
  element: Rect,
  {
    regions,
    bands,
    granular = false,
    dynamic = false,
    scroll = NO_SCROLL,
    covers = ALWAYS,
    ...options
  }: SafeAreaViewInsetsOptions
): EdgeInsets {
  const area = visibleArea(options);
  const covering = (region: SafeAreaRegion) =>
    region.owner === undefined || covers(region.owner);
  const scrolling = scroll.vertical || scroll.horizontal;
  let avoiding: SafeAreaRegion[];
  if (dynamic || (granular && !scrolling)) {
    avoiding = regions.filter(covering);
  } else {
    // A band counts when something in it that covers the element reaches where the element can be seen. Without a
    // breakdown, the band is all there is: the system draws it, on top of everything.
    const inside = regions.filter(
      (region) => covering(region) && overlaps(region.frame, area)
    );
    avoiding = bands.filter(
      (band) =>
        covering(band) &&
        (band.kind !== 'inset' ||
          inside.some((region) => contains(band.frame, region.frame, 0.5)))
    );
  }
  let rect = element;
  for (const axis of ['vertical', 'horizontal'] as const) {
    if (!scroll[axis]) continue;
    avoiding = withoutScrollingEdges(avoiding, axis);
    if (!dynamic) rect = sweepElement(rect, axis, area);
  }
  return computeElementInsets(rect, avoiding, { ...options, visible: area });
}

/** Where an element can be seen: its `visible` area, or else the whole provider. */
function visibleArea({ bounds, visible }: ElementInsetsOptions): Rect {
  const all = { x: 0, y: 0, width: bounds.width, height: bounds.height };
  return (visible && intersection(visible, all)) ?? (visible ? EMPTY : all);
}

const EMPTY: Rect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

/**
 * A region as the native side takes it. `edge`: 0 floating, then 1 top, 2 right, 3 bottom, 4 left. `side`: the other
 * edge of a corner region, coded the same way, or 0. `owner`: the view drawing it, 0 for system UI. `band`: a whole
 * inset band.
 */
export type TrackedRegion = Rect & {
  edge: number;
  side: number;
  owner: number;
  band: boolean;
};

const EDGE_CODES: Record<Edge, number> = {
  top: 1,
  right: 2,
  bottom: 3,
  left: 4,
};

/** The regions to hand the native side: only the kinds in `avoid`, grown by `spacing`. */
export function trackedRegions(
  regions: readonly SafeAreaRegion[],
  {
    avoid = DEFAULT_AVOID,
    spacing = 0,
  }: { avoid?: readonly SafeAreaRegionKind[]; spacing?: number }
): TrackedRegion[] {
  return regions
    .filter((region) => avoid.includes(region.kind))
    .map((region) => ({
      ...(spacing > 0 ? expand(region.frame, spacing) : rectOf(region.frame)),
      edge: region.edge ? EDGE_CODES[region.edge] : 0,
      side: region.side ? EDGE_CODES[region.side] : 0,
      owner: region.owner ?? 0,
      band: region.kind === 'inset',
    }));
}

/** The provider edge a rectangle is closest to: the one an accessory belongs to, unless it says otherwise. */
export function nearestEdge(
  frame: Rect,
  bounds: { width: number; height: number }
): Edge {
  const distances: [Edge, number][] = [
    ['bottom', bounds.height - maxY(frame)],
    ['top', frame.y],
    ['right', bounds.width - maxX(frame)],
    ['left', frame.x],
  ];
  return distances.reduce((best, next) => (next[1] < best[1] ? next : best))[0];
}

/** Edges as bits, for the native side: 1 top, 2 right, 4 bottom, 8 left. */
export function edgeMask(edges: readonly Edge[]): number {
  let mask = 0;
  for (const edge of new Set(edges)) mask += 2 ** (EDGE_CODES[edge] - 1);
  return mask;
}

const ALL_ADDITIVE: Readonly<Record<Edge, EdgeMode>> = Object.freeze({
  top: 'additive',
  right: 'additive',
  bottom: 'additive',
  left: 'additive',
});

function isEdgeList(edges: Edges): edges is readonly Edge[] {
  return Array.isArray(edges);
}

/**
 * `edges` as react-native-safe-area-context takes them, on every edge: a list of edges (each `additive`), or an
 * object with `additive`, `maximum` or `off` per edge (missing ones `off`). All four are `additive` by default.
 */
export function edgeModes(edges?: Edges): Readonly<Record<Edge, EdgeMode>> {
  if (edges == null) return ALL_ADDITIVE;
  if (isEdgeList(edges)) {
    const modes: Record<Edge, EdgeMode> = {
      top: 'off',
      right: 'off',
      bottom: 'off',
      left: 'off',
    };
    for (const edge of edges) modes[edge] = 'additive';
    return modes;
  }
  return {
    top: edges.top ?? 'off',
    right: edges.right ?? 'off',
    bottom: edges.bottom ?? 'off',
    left: edges.left ?? 'off',
  };
}

/** The edges that are not `off`. */
export function activeEdges(modes: Readonly<Record<Edge, EdgeMode>>): Edge[] {
  return EDGES.filter((edge) => modes[edge] !== 'off');
}

/**
 * Where an element would be without the margin it got from `mode="margin"`, which moved each of its edges in by that
 * much. Measuring that instead keeps the margin from feeding back into the next result.
 */
export function withoutMargins(rect: Rect, margins: EdgeInsets): Rect {
  return {
    x: rect.x - margins.left,
    y: rect.y - margins.top,
    width: rect.width + margins.left + margins.right,
    height: rect.height + margins.top + margins.bottom,
  };
}

export type ElementInsetsOptions = {
  edges?: readonly Edge[];
  avoid?: readonly SafeAreaRegionKind[];
  spacing?: number;
  /** The provider's size. The element is clipped to it first, so the result stays bounded. */
  bounds: { width: number; height: number };
  /**
   * Where the element can be seen at all: inside its clipping ancestors, such as a sheet or a scroll view. Only that
   * part of it counts. Defaults to the whole provider.
   */
  visible?: Rect;
};

/**
 * The safe-area insets for one element: on each edge, how far its content has to move in to clear the regions it
 * overlaps. Zero on edges where it overlaps nothing.
 */
export function computeElementInsets(
  element: Rect,
  regions: readonly SafeAreaRegion[],
  {
    edges = EDGES,
    avoid = DEFAULT_AVOID,
    spacing = 0,
    bounds,
    visible,
  }: ElementInsetsOptions
): EdgeInsets {
  const out: EdgeInsets = { ...ZERO_INSETS };
  // Clipping makes the result independent of any part of the element that can't be seen, and bounds every inset by
  // the provider's size, so padding applied to an auto-sized element can't keep growing it.
  const el = intersection(element, visibleArea({ bounds, visible }));
  if (!el) return out;

  for (const region of regions) {
    if (!avoid.includes(region.kind)) continue;
    const frame = spacing > 0 ? expand(region.frame, spacing) : region.frame;
    if (!overlaps(el, frame)) continue;

    const need: EdgeInsets = {
      top: maxY(frame) - el.y,
      right: maxX(el) - frame.x,
      bottom: maxY(el) - frame.y,
      left: maxX(frame) - el.x,
    };
    const candidates: readonly Edge[] = !region.edge
      ? EDGES
      : region.side
        ? [cornerExit(region.edge, region.side, el, need, edges)]
        : [region.edge];
    let best: Edge | null = null;
    for (const edge of candidates) {
      if (!edges.includes(edge)) continue;
      if (best === null || need[edge] < need[best]) best = edge;
    }
    if (best === null) continue;
    out[best] = Math.max(out[best], need[best]);
  }
  return out;
}

/**
 * The way out of a corner region (an iPad window's controls) for an element: away from the region's `edge`, below the
 * controls, unless that takes more than half of the element's size along that axis or isn't allowed. Then away from
 * its `side`, past the controls, the way a toolbar's items move over. A header level with the controls moves over; a
 * whole screen or a sidebar starts below them.
 */
function cornerExit(
  edge: Edge,
  side: Edge,
  element: Rect,
  need: EdgeInsets,
  edges: readonly Edge[]
): Edge {
  const size =
    edge === 'top' || edge === 'bottom' ? element.height : element.width;
  const away = edges.includes(edge) && need[edge] <= size / 2;
  return away || !edges.includes(side) ? edge : side;
}

/**
 * True when, after a padding change on `edge`, that edge of the element moved outwards by exactly the change. Such an
 * element is sized by its content and grows towards the region it is avoiding: padding can't move its content, and
 * recomputing from the grown box would only grow it more.
 *
 * An element that grows the other way is fine, such as a content-sized bar pinned to the bottom getting bottom
 * padding: its top moves up, its bottom stays, and the padding moves its content.
 */
export function followsOwnPadding(
  previous: { rect: Rect; applied: EdgeInsets },
  rect: Rect,
  applied: EdgeInsets,
  edge: Edge
): boolean {
  const change = applied[edge] - previous.applied[edge];
  if (change === 0) return false;
  const moved = {
    top: previous.rect.y - rect.y,
    left: previous.rect.x - rect.x,
    bottom: maxY(rect) - maxY(previous.rect),
    right: maxX(rect) - maxX(previous.rect),
  }[edge];
  return Math.abs(moved - change) < 0.5;
}

/** Removes an `offset`-mode translation from a measured rectangle, so applying a result never feeds back into it. */
export function removeOffset(rect: Rect, applied: EdgeInsets): Rect {
  return translate(
    rect,
    -(applied.left - applied.right),
    -(applied.top - applied.bottom)
  );
}

/**
 * Where an element sits in the provider, described the way absolute positioning is: any of `top`, `right`, `bottom`,
 * `left`, `width` and `height`. Missing values stretch the element to the provider's edges, so `{ top: 0, height: 56 }`
 * is a full-width strip at the top and `{}` is the whole provider.
 */
export type GranularPlacement = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  width?: number;
  height?: number;
};

function placeAxis(
  start: number | undefined,
  end: number | undefined,
  size: number | undefined,
  total: number
): [number, number] {
  const origin =
    start ?? (end !== undefined && size !== undefined ? total - end - size : 0);
  return [origin, size ?? total - origin - (end ?? 0)];
}

export function placementToRect(
  placement: GranularPlacement,
  bounds: { width: number; height: number }
): Rect {
  const [x, width] = placeAxis(
    placement.left,
    placement.right,
    placement.width,
    bounds.width
  );
  const [y, height] = placeAxis(
    placement.top,
    placement.bottom,
    placement.height,
    bounds.height
  );
  return { x, y, width, height };
}

export function regionsEqual(
  a: readonly SafeAreaRegion[],
  b: readonly SafeAreaRegion[]
) {
  return (
    a.length === b.length &&
    a.every((region, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        region.kind === other.kind &&
        region.edge === other.edge &&
        region.side === other.side &&
        region.owner === other.owner &&
        rectsEqual(region.frame, other.frame)
      );
    })
  );
}

export function insetsEqual(a: EdgeInsets, b: EdgeInsets, epsilon = 0.25) {
  return EDGES.every((edge) => Math.abs(a[edge] - b[edge]) < epsilon);
}

export function rectsEqual(a: Rect | null, b: Rect | null, epsilon = 0.25) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}
