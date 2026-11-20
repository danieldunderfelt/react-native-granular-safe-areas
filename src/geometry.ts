import type {
  Edge,
  EdgeInsets,
  GranularSafeAreaMetrics,
  Rect,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';

export const EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

export const DEFAULT_AVOID: readonly SafeAreaRegionKind[] = [
  'inset',
  'status',
  'camera',
  'systemBar',
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

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    maxX(inner) <= maxX(outer) &&
    maxY(inner) <= maxY(outer)
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
   * Break the vertical bar band down into the regions actually inside it. When `false`, every band stays whole and
   * the regions are the same as a regular safe area. Defaults to `true`.
   */
  refine?: boolean;
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
  { refine = true }: BuildRegionsOptions = {}
): SafeAreaRegion[] {
  const { width, height, insets } = metrics;
  const barEdge =
    refine && metrics.reservedRegionsSupported
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
      kind: 'camera',
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
      kind: 'systemBar',
      edge: attachedEdge(frame, width, height, insets),
      frame,
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
      kind: 'systemBar',
      edge,
      frame: {
        x: band.x,
        y: clipped.y,
        width: band.width,
        height: clipped.height,
      },
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
function columnBars(band: Rect, metrics: GranularSafeAreaMetrics): Rect[] {
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
  const insets: EdgeInsets = {
    top: Math.max(0, metrics.insets.top - rect.y),
    left: Math.max(0, metrics.insets.left - rect.x),
    bottom: Math.max(0, maxY(rect) - (metrics.height - metrics.insets.bottom)),
    right: Math.max(0, maxX(rect) - (metrics.width - metrics.insets.right)),
  };
  const clampInsets = (i: EdgeInsets): EdgeInsets => ({
    top: Math.min(i.top, rect.height),
    bottom: Math.min(i.bottom, rect.height),
    left: Math.min(i.left, rect.width),
    right: Math.min(i.right, rect.width),
  });
  return {
    ...metrics,
    width: rect.width,
    height: rect.height,
    insets: clampInsets(insets),
    statusBar: metrics.statusBar ? move(metrics.statusBar) : null,
    // The bar region is described relative to the window's edges; shift it like the safe-area insets.
    barRegionInsets: metrics.barRegionInsets
      ? {
          top: Math.max(0, metrics.barRegionInsets.top - rect.y),
          left: Math.max(0, metrics.barRegionInsets.left - rect.x),
          bottom: Math.max(
            0,
            maxY(rect) - (metrics.height - metrics.barRegionInsets.bottom)
          ),
          right: Math.max(
            0,
            maxX(rect) - (metrics.width - metrics.barRegionInsets.right)
          ),
        }
      : null,
    occlusions: metrics.occlusions.map((o) => ({
      ...move(o),
      active: o.active,
    })),
    divisions: metrics.divisions.map((d) => ({ ...move(d), active: d.active })),
    systemBars: metrics.systemBars.map(move),
  };
}

/** Metrics with only regular insets, for platforms that report nothing else (web, Android for now). */
export function metricsFromInsets(
  width: number,
  height: number,
  insets: EdgeInsets
): GranularSafeAreaMetrics {
  return {
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

/**
 * For content inside a scroll view: regions on the cross-axis edges (and floating ones) are stretched along the whole
 * scroll axis, because scrolling content passes under all of them. Regions on the scrolling edges are dropped; the
 * scroll view's content inset handles those.
 */
export function sweepRegions(
  regions: readonly SafeAreaRegion[],
  axis: 'vertical' | 'horizontal',
  width: number,
  height: number
): SafeAreaRegion[] {
  return withoutScrollingEdges(regions, axis).map((r) => ({
    ...r,
    frame:
      axis === 'vertical'
        ? { x: r.frame.x, y: 0, width: r.frame.width, height }
        : { x: 0, y: r.frame.y, width, height: r.frame.height },
  }));
}

/** Regions on the edges content scrolls towards are the scroll view's content inset's job, not the element's. */
export function withoutScrollingEdges(
  regions: readonly SafeAreaRegion[],
  axis: 'vertical' | 'horizontal'
): SafeAreaRegion[] {
  const scrollingEdges: readonly Edge[] =
    axis === 'vertical' ? ['top', 'bottom'] : ['left', 'right'];
  return regions.filter((r) => !(r.edge && scrollingEdges.includes(r.edge)));
}

/**
 * Puts scrolling content where it is on screen along the scroll axis, to measure it against {@link sweepRegions}.
 * Those span the whole axis, so only the cross axis matters, and content measured while it was scrolled out of view
 * (further down a list) gets the same insets as when it is visible.
 */
export function sweepElement(
  rect: Rect,
  axis: 'vertical' | 'horizontal',
  bounds: { width: number; height: number }
): Rect {
  return axis === 'vertical'
    ? { x: rect.x, y: 0, width: rect.width, height: bounds.height }
    : { x: 0, y: rect.y, width: bounds.width, height: rect.height };
}

/** A region as a dynamic view's native side takes it. `edge`: 0 floating, then 1 top, 2 right, 3 bottom, 4 left. */
export type TrackedRegion = Rect & { edge: number };

const EDGE_CODES: Record<Edge, number> = {
  top: 1,
  right: 2,
  bottom: 3,
  left: 4,
};

/**
 * The regions a dynamic element avoids, for the native side to test against the element's live position: only the
 * kinds in `avoid`, grown by `spacing`, and for scrolling content, without the regions on the scrolling edges.
 */
export function trackedRegions(
  regions: readonly SafeAreaRegion[],
  {
    avoid = DEFAULT_AVOID,
    spacing = 0,
    scrollable,
  }: {
    avoid?: readonly SafeAreaRegionKind[];
    spacing?: number;
    scrollable?: 'vertical' | 'horizontal';
  }
): TrackedRegion[] {
  return (scrollable ? withoutScrollingEdges(regions, scrollable) : regions)
    .filter((region) => avoid.includes(region.kind))
    .map((region) => ({
      ...(spacing > 0 ? expand(region.frame, spacing) : rectOf(region.frame)),
      edge: region.edge ? EDGE_CODES[region.edge] : 0,
    }));
}

/** Edges as bits, for the native side: 1 top, 2 right, 4 bottom, 8 left. */
export function edgeMask(edges: readonly Edge[]): number {
  let mask = 0;
  for (const edge of new Set(edges)) mask += 2 ** (EDGE_CODES[edge] - 1);
  return mask;
}

export type ElementInsetsOptions = {
  edges?: readonly Edge[];
  avoid?: readonly SafeAreaRegionKind[];
  spacing?: number;
  /** The provider's size. The element is clipped to it first, so the result stays bounded. */
  bounds: { width: number; height: number };
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
  }: ElementInsetsOptions
): EdgeInsets {
  const out: EdgeInsets = { ...ZERO_INSETS };
  // Clipping makes the result independent of any part of the element that is off-screen, and bounds every inset by
  // the provider's size, so padding applied to an auto-sized element can't keep growing it.
  const el = intersection(element, {
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
  });
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
    const candidates = region.edge ? [region.edge] : EDGES;
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
