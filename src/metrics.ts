import type {
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
  if (!isObject(data)) return null;
  const width = num(data.width);
  const height = num(data.height);
  const insets = parseInsets(data.insets);
  if (width === null || height === null || !insets) return null;

  const metrics: GranularSafeAreaMetrics = {
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
      ? data.systemBars.flatMap((r) => parseRect(r) ?? [])
      : [],
    // Unknown counts as visible: it keeps the band whole unless a vertical bar was found.
    barContainersVisible: data.barContainersVisible !== false,
    reservedRegionsSupported: data.reservedRegionsSupported === true,
  };
  return metrics;
}
