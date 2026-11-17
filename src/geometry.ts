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
  const spans = (a: Edge, b: Edge) =>
    touching.some(([e]) => e === a) && touching.some(([e]) => e === b);
  const candidates = touching.filter(
    ([edge]) =>
      !(
        ((edge === 'left' || edge === 'right') && spans('left', 'right')) ||
        ((edge === 'top' || edge === 'bottom') && spans('top', 'bottom'))
      )
  );
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0]?.[0] ?? null;
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
  const columnBars = new Set<Rect>();
  for (const edge of EDGES) {
    const size = insets[edge];
    if (size <= 0) continue;
    const band = bandRect(edge, size, width, height);
    const refined = edge === barEdge ? refineBand(edge, band, metrics) : null;
    if (refined) refined.bars.forEach((bar) => columnBars.add(bar));
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
    if (columnBars.has(bar)) continue;
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
  const inBand = (r: Rect) => overlaps(r, band);

  const statusBottoms: number[] = [];
  if (metrics.statusBar && inBand(metrics.statusBar))
    statusBottoms.push(maxY(metrics.statusBar));
  const barTop = metrics.barRegionInsets?.top;
  if (barTop !== undefined && barTop > 0) statusBottoms.push(barTop);
  if (statusBottoms.length === 0) return null;

  // A camera can reach below the status bar, e.g. a Dynamic Island showing a Live Activity.
  const cameraBottoms = metrics.occlusions
    .filter((o) => o.active && inBand(o))
    .map(maxY);
  const clusterBottom = Math.min(
    Math.max(...statusBottoms, ...cameraBottoms),
    band.height
  );

  // Only tall bars centered in the column are vertical bars. Horizontal bars that merely cross it are not.
  const verticalBars = metrics.systemBars.filter((bar) => {
    const centerX = bar.x + bar.width / 2;
    return bar.height > bar.width && centerX >= band.x && centerX <= maxX(band);
  });
  if (metrics.barContainersVisible && verticalBars.length === 0) return null;

  const regions: SafeAreaRegion[] = [
    {
      kind: 'status',
      edge,
      frame: { x: band.x, y: band.y, width: band.width, height: clusterBottom },
    },
  ];
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
  const scrollingEdges: readonly Edge[] =
    axis === 'vertical' ? ['top', 'bottom'] : ['left', 'right'];
  return regions
    .filter((r) => !(r.edge && scrollingEdges.includes(r.edge)))
    .map((r) => ({
      ...r,
      frame:
        axis === 'vertical'
          ? { x: r.frame.x, y: 0, width: r.frame.width, height }
          : { x: 0, y: r.frame.y, width, height: r.frame.height },
    }));
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
 * True when an element measured after a padding change grew on `axis` by exactly that change. Such an element is
 * sized by its content: padding can't move its content, and recomputing from the grown box would only grow it more.
 */
export function grewByOwnPadding(
  previous: { rect: Rect; applied: EdgeInsets },
  rect: Rect,
  applied: EdgeInsets,
  axis: 'horizontal' | 'vertical'
): boolean {
  const padding = (i: EdgeInsets) =>
    axis === 'horizontal' ? i.left + i.right : i.top + i.bottom;
  const size = (r: Rect) => (axis === 'horizontal' ? r.width : r.height);
  const change = padding(applied) - padding(previous.applied);
  return (
    change !== 0 && Math.abs(size(rect) - size(previous.rect) - change) < 0.5
  );
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
