import type { BuildRegionsOptions, SystemControls } from './geometry';
import type {
  AndroidInsetSources,
  Edge,
  GranularSafeAreaMetrics,
  Rect,
  SafeAreaRegion,
} from './types';

// Android's breakdown of the bands. The rule is the same as everywhere: never worse than a regular safe area. A band
// is only broken down where the system says exactly what's in it, and everything else in it is the app's to draw on:
//
// - A band made only of the display cutout (a punch-hole camera on the side, in landscape) becomes the camera housings
//   in it, plus the display's rounded corners at its ends, which the whole band kept clear of too.
// - A top band made only of a caption bar whose background the app draws (desktop windowing, with
//   `APPEARANCE_TRANSPARENT_CAPTION_BAR_BACKGROUND`) becomes the window buttons in it.
//
// Bands with the status bar or the navigation bar in them stay whole: those bars span the edge.

const EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

/** How much rounding the native side's conversions to dp leave. */
const TOLERANCE = 0.5;

const maxX = (r: Rect) => r.x + r.width;
const maxY = (r: Rect) => r.y + r.height;

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(maxX(a), maxX(b)) - x;
  const height = Math.min(maxY(a), maxY(b)) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

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

/** The part of `band` level with `frame` along its edge, across the band's whole depth. */
function acrossBand(edge: Edge, band: Rect, frame: Rect): Rect | null {
  const clipped = intersection(frame, band);
  if (!clipped) return null;
  return edge === 'top' || edge === 'bottom'
    ? { x: clipped.x, y: band.y, width: clipped.width, height: band.height }
    : { x: band.x, y: clipped.y, width: band.width, height: clipped.height };
}

/** Sorted along the band's edge, without overlaps. */
function merge(edge: Edge, frames: Rect[]): Rect[] {
  const horizontal = edge === 'top' || edge === 'bottom';
  const start = (r: Rect) => (horizontal ? r.x : r.y);
  const end = (r: Rect) => (horizontal ? maxX(r) : maxY(r));
  const sorted = [...frames].sort((a, b) => start(a) - start(b));
  const out: Rect[] = [];
  for (const frame of sorted) {
    const last = out[out.length - 1];
    if (last && start(frame) <= end(last)) {
      const to = Math.max(end(last), end(frame));
      out[out.length - 1] = horizontal
        ? { ...last, width: to - last.x }
        : { ...last, height: to - last.y };
    } else {
      out.push(frame);
    }
  }
  return out;
}

/** The camera housings in a band made only of the display cutout, and the rounded corners at its ends. */
function cutoutBand(
  edge: Edge,
  band: Rect,
  metrics: GranularSafeAreaMetrics,
  android: AndroidInsetSources
): SafeAreaRegion[] | null {
  const size = metrics.insets[edge];
  if (
    android.bars[edge] > 0 ||
    android.caption[edge] > 0 ||
    android.cutout[edge] + TOLERANCE < size
  ) {
    return null;
  }
  const cameras = metrics.occlusions.flatMap((occlusion) => {
    const frame = occlusion.active ? acrossBand(edge, band, occlusion) : null;
    return frame ? [frame] : [];
  });
  // A cutout inset without a camera in it is something the native side didn't find.
  if (cameras.length === 0) return null;
  const corners = android.corners.flatMap((corner) => {
    const frame = acrossBand(edge, band, corner);
    return frame ? [frame] : [];
  });
  return merge(edge, [...cameras, ...corners]).map((frame) => ({
    kind: 'cutout',
    edge,
    frame,
  }));
}

/** The window buttons in a top band made only of a caption bar the app draws the background of. */
function captionBand(
  edge: Edge,
  band: Rect,
  metrics: GranularSafeAreaMetrics,
  android: AndroidInsetSources
): SafeAreaRegion[] | null {
  const size = metrics.insets[edge];
  if (
    edge !== 'top' ||
    !android.captionTransparent ||
    android.bars[edge] > 0 ||
    android.cutout[edge] > 0 ||
    android.caption[edge] + TOLERANCE < size
  ) {
    return null;
  }
  const buttons = metrics.systemBars.flatMap((bar) => {
    const frame = acrossBand(edge, band, bar);
    return frame ? [frame] : [];
  });
  // A caption bar without buttons reported: the platform is too old to say where they are.
  if (buttons.length === 0) return null;
  return merge(edge, buttons).map((frame) => ({
    kind: 'controls',
    edge,
    frame,
  }));
}

function refineBand(
  edge: Edge,
  band: Rect,
  metrics: GranularSafeAreaMetrics
): SafeAreaRegion[] | null {
  const { android } = metrics;
  if (!android) return null;
  return (
    cutoutBand(edge, band, metrics, android) ??
    captionBand(edge, band, metrics, android)
  );
}

/**
 * `buildRegions` for Android. Each non-zero inset is a whole band, unless the system says exactly what's in it: a
 * band made only of the display cutout becomes its camera housings, and a top band made only of a caption bar the app
 * draws the background of becomes its window buttons. Active folds are regions of their own.
 */
export function buildAndroidRegions(
  metrics: GranularSafeAreaMetrics,
  { granular = true }: BuildRegionsOptions = {}
): SafeAreaRegion[] {
  const { width, height, insets } = metrics;
  const regions: SafeAreaRegion[] = [];
  for (const edge of EDGES) {
    const size = insets[edge];
    if (size <= 0) continue;
    const band = bandRect(edge, size, width, height);
    regions.push(
      ...((granular ? refineBand(edge, band, metrics) : null) ?? [
        { kind: 'inset', edge, frame: band },
      ])
    );
  }
  for (const division of metrics.divisions) {
    if (!division.active) continue;
    const { x, y, width: w, height: h } = division;
    regions.push({
      kind: 'fold',
      edge: null,
      frame: { x, y, width: w, height: h },
    });
  }
  return regions;
}

/**
 * `getSystemControls` for Android: the caption bar of a window in desktop windowing whose background the app draws,
 * with the window buttons in it. `null` everywhere else.
 */
export function getAndroidSystemControls(
  metrics: GranularSafeAreaMetrics,
  extra: readonly Rect[] = []
): SystemControls | null {
  const { width, height, insets } = metrics;
  const edge: Edge = 'top';
  if (insets.top <= 0) return null;
  const strip = bandRect(edge, insets.top, width, height);
  const buttons = refineBand(edge, strip, metrics);
  if (!buttons || buttons.some((region) => region.kind !== 'controls')) {
    return null;
  }
  const occupied = merge(edge, [
    ...buttons.map((region) => region.frame),
    ...extra.flatMap((rect) => {
      const frame = acrossBand(edge, strip, rect);
      return frame ? [frame] : [];
    }),
  ]);
  const free: Rect[] = [];
  let start = strip.x;
  for (const taken of occupied) {
    if (taken.x > start) {
      free.push({
        x: start,
        y: strip.y,
        width: taken.x - start,
        height: strip.height,
      });
    }
    start = Math.max(start, maxX(taken));
  }
  if (start < maxX(strip)) {
    free.push({
      x: start,
      y: strip.y,
      width: maxX(strip) - start,
      height: strip.height,
    });
  }
  return {
    edge,
    strip,
    occupied,
    free,
    itemSize: strip.height,
    center: strip.y + strip.height / 2,
    status: null,
    start: strip.x,
    cameras: [],
    hasBars: true,
  };
}
