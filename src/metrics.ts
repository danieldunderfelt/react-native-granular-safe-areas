import type {
  AndroidInsetSources,
  EdgeInsets,
  GranularSafeAreaMetrics,
  Rect,
  ReservedRegionFrame,
} from './types';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function parseRect(v: unknown): Rect | null {
  if (!isObject(v)) return null;
  const x = num(v.x);
  const y = num(v.y);
  const width = num(v.width);
  const height = num(v.height);
  if (x === null || y === null || width === null || height === null)
    return null;
  return { x, y, width, height };
}

function parseInsets(v: unknown): EdgeInsets | null {
  if (!isObject(v)) return null;
  const top = num(v.top);
  const right = num(v.right);
  const bottom = num(v.bottom);
  const left = num(v.left);
  if (top === null || right === null || bottom === null || left === null)
    return null;
  return { top, right, bottom, left };
}

function parseRegions(v: unknown): ReservedRegionFrame[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    const rect = parseRect(item);
    return rect && isObject(item)
      ? [{ ...rect, active: item.active !== false }]
      : [];
  });
}

/** Android's breakdown of the insets. `null` unless every part of it is there: without it, the bands stay whole. */
function parseAndroid(v: unknown): AndroidInsetSources | null {
  if (!isObject(v)) return null;
  const bars = parseInsets(v.bars);
  const caption = parseInsets(v.caption);
  const cutout = parseInsets(v.cutout);
  if (!bars || !caption || !cutout) return null;
  return {
    bars,
    caption,
    cutout,
    captionTransparent: v.captionTransparent === true,
    corners: Array.isArray(v.corners)
      ? v.corners.flatMap((r) => {
          const rect = parseRect(r);
          return rect ? [rect] : [];
        })
      : [],
  };
}

/**
 * Parses the JSON the native side reports. Returns `null` for anything without a size and insets. Missing optional
 * facts degrade to "unknown", which makes the regions fall back to whole inset bands.
 */
export function parseMetrics(json: string | null | undefined) {
  if (!json) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  return parseMetricsObject(data);
}

/** Parses an already-decoded metrics object, such as the one inside {@link getDiagnostics}. */
export function parseMetricsObject(
  data: unknown
): GranularSafeAreaMetrics | null {
  if (!isObject(data)) return null;
  const width = num(data.width);
  const height = num(data.height);
  const insets = parseInsets(data.insets);
  if (width === null || height === null || !insets) return null;

  const metrics: GranularSafeAreaMetrics = {
    platform:
      data.platform === 'android' || data.platform === 'web'
        ? data.platform
        : 'ios',
    width,
    height,
    insets,
    verticalBarEdge:
      data.verticalBarEdge === 'leading' || data.verticalBarEdge === 'trailing'
        ? data.verticalBarEdge
        : null,
    layoutDirection: data.layoutDirection === 'rtl' ? 'rtl' : 'ltr',
    statusBar: parseRect(data.statusBar),
    barRegionInsets: parseInsets(data.barRegionInsets),
    occlusions: parseRegions(data.occlusions),
    divisions: parseRegions(data.divisions),
    systemBars: Array.isArray(data.systemBars)
      ? data.systemBars.flatMap((r) => {
          const rect = parseRect(r);
          if (!rect) return [];
          const owner = isObject(r) ? num(r.owner) : null;
          return [owner !== null ? { ...rect, owner } : rect];
        })
      : [],
    // Unknown counts as visible: it keeps the band whole unless a vertical bar was found.
    barContainersVisible: data.barContainersVisible !== false,
    barItemsKnown: data.barItemsKnown === true,
    reservedRegionsSupported: data.reservedRegionsSupported === true,
  };
  if (data.idiom === 'phone' || data.idiom === 'pad')
    metrics.idiom = data.idiom;
  if (
    data.horizontalSizeClass === 'compact' ||
    data.horizontalSizeClass === 'regular'
  ) {
    metrics.horizontalSizeClass = data.horizontalSizeClass;
  }
  if (typeof data.deviceModel === 'string' && data.deviceModel.length > 0) {
    metrics.deviceModel = data.deviceModel;
  }
  if (typeof data.systemVersion === 'string' && data.systemVersion.length > 0) {
    metrics.systemVersion = data.systemVersion;
  }
  const windowControls = parseRect(data.windowControls);
  if (windowControls) metrics.windowControls = windowControls;
  const android = parseAndroid(data.android);
  if (android) metrics.android = android;
  return metrics;
}
