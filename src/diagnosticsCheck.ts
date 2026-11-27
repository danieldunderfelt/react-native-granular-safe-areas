import {
  getDeviceInfo,
  UNKNOWN_DEVICE,
  type SafeAreaDeviceInfo,
} from './device';
import {
  isVersionAtLeast,
  parseOSVersion,
  type SafeAreaUnavailableReason,
} from './fallback';
import { buildRegions, overlaps, resolveVerticalBarEdge } from './geometry';
import { parseMetricsObject } from './metrics';
import type {
  Edge,
  GranularSafeAreaMetrics,
  Rect,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';

type Json = Record<string, unknown>;

export type DiagnosticCheckStatus = 'pass' | 'warn' | 'fail';

export type DiagnosticCheck = {
  /** Stable identifier for the check, e.g. `'ios-sdk'`, `'vertical-bar-controls'`, `'metrics-sync'`. */
  id: string;
  status: DiagnosticCheckStatus;
  /** Human-readable explanation of what was checked or what went wrong. */
  message: string;
};

export type DiagnosticsCheckResult = {
  /** `true` when no check failed. Warnings do not fail the check. */
  ok: boolean;
  /** Primary machine-readable failure code when `ok` is `false`, or `null` when passing. */
  reason: SafeAreaUnavailableReason | null;
  /** The platform the diagnostics came from, or `'unknown'` when missing or unrecognized. */
  platform: 'ios' | 'android' | 'unknown';
  /** Classified device form factor, posture, hardware/OS metadata, and granular support. */
  device: SafeAreaDeviceInfo;
  /** The regions built from the primary window's metrics in the diagnostics payload. */
  regions: SafeAreaRegion[];
  /** Individual checks run against the diagnostics, in order. */
  checks: DiagnosticCheck[];
};

export type CheckDiagnosticsOptions = {
  /**
   * The live metrics currently held by the store (for example from `useGranularSafeAreaMetrics()`), compared against
   * the native window's metrics to catch a stale observer or mismatched window.
   */
  metrics?: GranularSafeAreaMetrics | null;
  /**
   * The live regions currently held by the store (for example from `useSafeAreaRegions()`). Used when `metrics` isn't
   * passed to check that the store matches the native window.
   */
  regions?: readonly SafeAreaRegion[];
};

/**
 * Checks a diagnostics payload from `getDiagnostics()` (or a Probe dump `{ providerMetrics, regions, native }`)
 * to verify that granular safe areas and system bar controls are being detected and refined as expected.
 */
export function checkDiagnostics(
  diagnostics: Record<string, unknown> | null | undefined,
  options: CheckDiagnosticsOptions = {}
): DiagnosticsCheckResult {
  if (!isObject(diagnostics)) {
    return {
      ok: false,
      reason: 'no-metrics',
      platform: 'unknown',
      device: UNKNOWN_DEVICE,
      regions: [],
      checks: [
        {
          id: 'diagnostics',
          status: 'fail',
          message: 'No native diagnostics available.',
        },
      ],
    };
  }

  // Accept either raw `getDiagnostics()` output or a ProbeScreen wrapper `{ providerMetrics, regions, native }`.
  let raw: Json = diagnostics;
  let liveMetrics = options.metrics;
  let liveRegions = options.regions;
  if (
    isObject(diagnostics.native) &&
    !Array.isArray(diagnostics.windows) &&
    diagnostics.platform !== 'android'
  ) {
    if (liveMetrics === undefined && 'providerMetrics' in diagnostics) {
      liveMetrics =
        diagnostics.providerMetrics === null
          ? null
          : parseMetricsObject(diagnostics.providerMetrics);
    }
    if (liveRegions === undefined && Array.isArray(diagnostics.regions)) {
      liveRegions = parseRegionList(diagnostics.regions);
    }
    raw = diagnostics.native;
  }

  if (raw.platform === 'android') {
    return checkAndroidDiagnostics(raw, liveMetrics, liveRegions);
  }
  if (Array.isArray(raw.windows)) {
    return checkIOSDiagnostics(raw, liveMetrics, liveRegions);
  }
  return {
    ok: false,
    reason: 'check-failed',
    platform: 'unknown',
    device: UNKNOWN_DEVICE,
    regions: [],
    checks: [
      {
        id: 'diagnostics',
        status: 'fail',
        message: 'Unrecognized diagnostics format.',
      },
    ],
  };
}

const IOS_BAR_CONTROL_CLASSES = [
  'UIPlatformGlassInteractionView',
  '_UIButtonBarButton',
  '_UIModernBarButton',
  '_UITabBarItemPlatterView',
  '_UITabBarPlatterView',
  '_UITabButton',
] as const;

function checkIOSDiagnostics(
  raw: Json,
  liveMetrics: GranularSafeAreaMetrics | null | undefined,
  liveRegions: readonly SafeAreaRegion[] | undefined
): DiagnosticsCheckResult {
  const checks: DiagnosticCheck[] = [];
  const device = isObject(raw.device) ? raw.device : null;
  const sdk = isObject(raw.sdk) ? raw.sdk : null;
  const windows = Array.isArray(raw.windows) ? raw.windows : [];
  const primary = pickPrimaryIOSWindow(windows);
  const metrics = primary ? parseMetricsObject(primary.metrics) : null;

  const rawMachine =
    typeof device?.machine === 'string' ? device.machine : null;
  const rawSystemVersion =
    typeof device?.systemVersion === 'string' ? device.systemVersion : null;

  if (!primary || !metrics) {
    checks.push({
      id: 'window',
      status: 'fail',
      message: 'No visible key window with valid safe-area metrics.',
    });
    return {
      ok: false,
      reason: 'no-metrics',
      platform: 'ios',
      device: getDeviceInfo(null, {
        platform: 'ios',
        model: rawMachine,
        systemVersion: rawSystemVersion,
      }),
      regions: [],
      checks,
    };
  }

  const machine = metrics.deviceModel ?? rawMachine ?? 'unknown device';
  const systemVersion = metrics.systemVersion ?? rawSystemVersion ?? 'unknown';
  checks.push({
    id: 'window',
    status: 'pass',
    message: `Key window ${fmt(metrics.width)}×${fmt(metrics.height)} (${machine}, iOS ${systemVersion}).`,
  });

  const version = parseOSVersion(systemVersion);
  if (version && isVersionAtLeast(version, 27, 1)) {
    const hasSDK = sdk?.hasIOS27_1SDK === 1 || sdk?.hasIOS27_1SDK === true;
    if (!hasSDK || !metrics.reservedRegionsSupported) {
      checks.push({
        id: 'ios-sdk',
        status: 'fail',
        message: `Running on iOS ${systemVersion}, but built without the iOS 27.1+ SDK; reserved regions and vertical-bar refinement are disabled.`,
      });
    } else {
      checks.push({
        id: 'ios-sdk',
        status: 'pass',
        message: 'Built with iOS 27.1+ SDK; reserved regions are active.',
      });
    }
  }

  const regions = buildRegions(metrics);
  const barEdge = resolveVerticalBarEdge(metrics);
  if (barEdge) {
    checkIOSVerticalBar(primary, metrics, barEdge, regions, checks);
  }

  checkMetricsSync(metrics, regions, liveMetrics, liveRegions, checks);

  const ok = checks.every((c) => c.status !== 'fail');
  return {
    ok,
    reason: ok ? null : unavailableReasonFromChecks(checks, liveMetrics),
    platform: 'ios',
    device: getDeviceInfo(metrics, {
      platform: 'ios',
      model: rawMachine,
      systemVersion: rawSystemVersion,
      fallbackToBands: !ok,
    }),
    regions,
    checks,
  };
}

function checkIOSVerticalBar(
  window: Json,
  metrics: GranularSafeAreaMetrics,
  barEdge: 'left' | 'right',
  regions: SafeAreaRegion[],
  checks: DiagnosticCheck[]
) {
  const bandSize = metrics.insets[barEdge];
  const band: Rect =
    barEdge === 'left'
      ? { x: 0, y: 0, width: bandSize, height: metrics.height }
      : {
          x: metrics.width - bandSize,
          y: 0,
          width: bandSize,
          height: metrics.height,
        };

  const hasBarRegionTop =
    metrics.barRegionInsets !== null && metrics.barRegionInsets.top >= 0;
  const hasRealStatusBar =
    metrics.statusBar !== null &&
    metrics.statusBar.width >= 10 &&
    metrics.statusBar.height >= 10 &&
    overlaps(metrics.statusBar, band);
  const statusRegion = regions.find(
    (r) => r.kind === 'status' && r.edge === barEdge
  );

  if (!hasBarRegionTop && !hasRealStatusBar) {
    checks.push({
      id: 'vertical-bar-status',
      status: 'fail',
      message: `Nothing reports where the status cluster ends on the ${barEdge} edge; the band stays whole.`,
    });
  } else {
    const end = statusRegion
      ? statusRegion.frame.y + statusRegion.frame.height
      : (metrics.barRegionInsets?.top ?? 0);
    checks.push({
      id: 'vertical-bar-status',
      status: 'pass',
      message: `Status cluster on the ${barEdge} edge ends at ${fmt(end)} pt.`,
    });
  }

  const columnControls = regions.filter(
    (r) => r.kind === 'controls' && r.edge === barEdge
  );
  if (metrics.barContainersVisible) {
    if (!metrics.barItemsKnown && columnControls.length === 0) {
      checks.push({
        id: 'floating-bar-container',
        status: 'fail',
        message: `UIKit bar containers are visible, but no floating bar container was recognized; the ${barEdge} column fell back to a whole inset.`,
      });
    } else {
      checks.push({
        id: 'floating-bar-container',
        status: 'pass',
        message: `Floating bar containers recognized (${columnControls.length} control region${plural(columnControls.length)} in the ${barEdge} column).`,
      });
    }
  }

  const unrefinedBand = regions.find(
    (r) => r.kind === 'inset' && r.edge === barEdge
  );
  if (unrefinedBand) {
    checks.push({
      id: 'vertical-bar-refinement',
      status: 'fail',
      message: `The ${barEdge} vertical bar band (${fmt(band.width)} pt) was not refined into granular regions.`,
    });
  } else {
    const parts: string[] = [];
    if (statusRegion) parts.push('status');
    if (columnControls.length > 0) {
      parts.push(
        `${columnControls.length} controls region${plural(columnControls.length)}`
      );
    }
    checks.push({
      id: 'vertical-bar-refinement',
      status: 'pass',
      message: `The ${barEdge} vertical bar band refined${parts.length > 0 ? ` into ${parts.join(' and ')}` : ' (column free)'}.`,
    });
  }

  // Cross-check the UIKit view hierarchy near the column against reported controls regions.
  const edgeViews = Array.isArray(window.viewsNearEdges)
    ? window.viewsNearEdges.filter(isObject)
    : [];
  const uncovered: { name: string; frame: Rect }[] = [];
  let visibleVerticalTabBar = false;

  for (const view of edgeViews) {
    const alpha = typeof view.alpha === 'number' ? view.alpha : 1;
    if (alpha < 0.01) continue;
    const frame = parseRect(view.frame);
    if (!frame || frame.width <= 0 || frame.height <= 0) continue;
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    const inBandX =
      frame.width <= band.width + 1 &&
      centerX >= band.x &&
      centerX <= band.x + band.width;
    if (!inBandX || centerY < 0 || centerY > metrics.height) continue;

    const classes = stringArray(view.classes);
    if (
      view.isBar === true &&
      classes.some((c) => c.includes('TabBar')) &&
      frame.height > frame.width
    ) {
      visibleVerticalTabBar = true;
    }

    const matchedClass = classes.find((c) =>
      IOS_BAR_CONTROL_CLASSES.some((pattern) => c.includes(pattern))
    );
    if (!matchedClass) continue;
    if (
      statusRegion &&
      centerY >= statusRegion.frame.y &&
      centerY <= statusRegion.frame.y + statusRegion.frame.height
    ) {
      continue;
    }
    const covered = columnControls.some(
      (r) =>
        centerY >= r.frame.y - 1 && centerY <= r.frame.y + r.frame.height + 1
    );
    if (!covered) {
      uncovered.push({ name: shortClassName(matchedClass), frame });
    }
  }

  const hasTabBarController = hasViewControllerMatching(
    window.viewControllers,
    (name) => name.includes('TabBarController')
  );
  const bars = isObject(window.bars) ? window.bars : null;
  const barViews = Array.isArray(bars?.views)
    ? bars.views.filter(isObject)
    : [];
  const leakedPlaceholder =
    metrics.barItemsKnown &&
    barViews.some((bar) => {
      if (bar.visible !== true) return false;
      const frame = parseRect(bar.frame);
      if (!frame) return false;
      const classes = stringArray(bar.classes);
      return (
        classes.some((c) => c === 'UITabBar' || c === 'UIToolbar') &&
        frame.height > frame.width &&
        frame.height >= metrics.height * 0.9
      );
    });

  if (uncovered.length > 0) {
    // Group nested subviews of the same capsule so the message lists distinct regions.
    const groups = deduplicateRects(uncovered);
    const summary = groups
      .map(
        (g) =>
          `${g.name} at y=${fmt(g.frame.y)}..${fmt(g.frame.y + g.frame.height)}`
      )
      .join(', ');
    checks.push({
      id: 'vertical-bar-controls',
      status: 'fail',
      message: `Visible UIKit bar controls in the ${barEdge} column are missing from controls regions: ${summary}.`,
    });
  } else if (
    hasTabBarController &&
    visibleVerticalTabBar &&
    columnControls.length === 0
  ) {
    checks.push({
      id: 'vertical-bar-controls',
      status: 'fail',
      message: `A UITabBarController is visible on the ${barEdge} edge, but no controls region was reported in the column.`,
    });
  } else if (leakedPlaceholder) {
    checks.push({
      id: 'vertical-bar-controls',
      status: 'warn',
      message:
        'A full-height vertical UITabBar placeholder was reported as a controls region.',
    });
  } else {
    checks.push({
      id: 'vertical-bar-controls',
      status: 'pass',
      message:
        columnControls.length > 0
          ? `${columnControls.length} vertical bar control region${plural(columnControls.length)} ${columnControls.length === 1 ? 'matches' : 'match'} the UIKit hierarchy.`
          : 'No vertical bar controls present in the UIKit hierarchy.',
    });
  }
}

function checkAndroidDiagnostics(
  raw: Json,
  liveMetrics: GranularSafeAreaMetrics | null | undefined,
  liveRegions: readonly SafeAreaRegion[] | undefined
): DiagnosticsCheckResult {
  const checks: DiagnosticCheck[] = [];
  const rawDevice = typeof raw.device === 'string' ? raw.device : null;
  const rawSdk = typeof raw.sdk === 'number' ? String(raw.sdk) : null;
  const window = isObject(raw.window) ? raw.window : null;
  const metrics = window ? parseMetricsObject(window.metrics) : null;
  if (!window || !metrics) {
    checks.push({
      id: 'window',
      status: 'fail',
      message: 'No Android window with valid safe-area metrics.',
    });
    return {
      ok: false,
      reason: 'no-metrics',
      platform: 'android',
      device: getDeviceInfo(null, {
        platform: 'android',
        model: rawDevice,
        systemVersion: rawSdk,
      }),
      regions: [],
      checks,
    };
  }

  const device = metrics.deviceModel ?? rawDevice ?? 'unknown device';
  const sdk = metrics.systemVersion ?? rawSdk ?? 'unknown';
  checks.push({
    id: 'window',
    status: 'pass',
    message: `Android window ${fmt(metrics.width)}×${fmt(metrics.height)} (${device}, API ${sdk}).`,
  });

  const regions = buildRegions(metrics);
  const sources = metrics.android;
  if (!sources) {
    checks.push({
      id: 'android-sources',
      status: 'fail',
      message:
        'Missing Android inset source breakdown (bars, caption, cutout); bands stay whole.',
    });
  } else {
    checks.push({
      id: 'android-sources',
      status: 'pass',
      message: 'Android inset sources reported.',
    });

    const cutoutOnlyEdges = (
      ['top', 'right', 'bottom', 'left'] as const
    ).filter(
      (edge) =>
        sources.cutout[edge] > 0 &&
        sources.bars[edge] === 0 &&
        sources.caption[edge] === 0
    );
    if (cutoutOnlyEdges.length > 0 && metrics.occlusions.length > 0) {
      const unrefined = cutoutOnlyEdges.filter((edge) =>
        regions.some((r) => r.kind === 'inset' && r.edge === edge)
      );
      if (unrefined.length > 0) {
        checks.push({
          id: 'cutout-refinement',
          status: 'fail',
          message: `Cutout-only band on ${unrefined.join(', ')} edge was not refined into cutout regions.`,
        });
      } else {
        checks.push({
          id: 'cutout-refinement',
          status: 'pass',
          message: `Cutout-only band on ${cutoutOnlyEdges.join(', ')} edge refined.`,
        });
      }
    }

    if (sources.captionTransparent && metrics.systemBars.length > 0) {
      const hasControls = regions.some((r) => r.kind === 'controls');
      checks.push(
        hasControls
          ? {
              id: 'caption-controls',
              status: 'pass',
              message: 'Transparent caption bar buttons reported as controls.',
            }
          : {
              id: 'caption-controls',
              status: 'fail',
              message:
                'Transparent caption bar has window buttons, but no controls region was produced.',
            }
      );
    }
  }

  checkMetricsSync(metrics, regions, liveMetrics, liveRegions, checks);

  const ok = checks.every((c) => c.status !== 'fail');
  return {
    ok,
    reason: ok ? null : unavailableReasonFromChecks(checks, liveMetrics),
    platform: 'android',
    device: getDeviceInfo(metrics, {
      platform: 'android',
      model: rawDevice,
      systemVersion: rawSdk,
      fallbackToBands: !ok,
    }),
    regions,
    checks,
  };
}

function checkMetricsSync(
  windowMetrics: GranularSafeAreaMetrics,
  windowRegions: readonly SafeAreaRegion[],
  liveMetrics: GranularSafeAreaMetrics | null | undefined,
  liveRegions: readonly SafeAreaRegion[] | undefined,
  checks: DiagnosticCheck[]
) {
  if (liveMetrics === undefined && liveRegions === undefined) return;

  if (liveMetrics === null) {
    checks.push({
      id: 'metrics-sync',
      status: 'fail',
      message: 'Active store has not received metrics yet.',
    });
    return;
  }

  if (liveMetrics) {
    const sameSize =
      Math.abs(liveMetrics.width - windowMetrics.width) <= 1 &&
      Math.abs(liveMetrics.height - windowMetrics.height) <= 1;
    if (!sameSize) {
      checks.push({
        id: 'metrics-sync',
        status: 'pass',
        message: `Store is scoped to a ${fmt(liveMetrics.width)}×${fmt(liveMetrics.height)} subrect (window is ${fmt(windowMetrics.width)}×${fmt(windowMetrics.height)}).`,
      });
      return;
    }
    const built = buildRegions(liveMetrics);
    if (!sameStructuralRegions(built, windowRegions)) {
      checks.push({
        id: 'metrics-sync',
        status: 'fail',
        message: `Store reports ${built.length} region${plural(built.length)}, while the key window has ${windowRegions.length}; the observer may be stale or attached to another window.`,
      });
    } else {
      checks.push({
        id: 'metrics-sync',
        status: 'pass',
        message: `Store metrics match the key window (${windowRegions.length} region${plural(windowRegions.length)}).`,
      });
    }
    return;
  }

  if (liveRegions) {
    // Exclude JS-owned regions (SafeAreaAccessory, SystemBackButton), which aren't in raw window metrics.
    const systemOnly = liveRegions.filter(
      (r) => r.kind !== 'accessory' && (r.owner === undefined || r.owner >= 0)
    );
    if (!sameStructuralRegions(systemOnly, windowRegions)) {
      checks.push({
        id: 'metrics-sync',
        status: 'fail',
        message: `Store reports ${systemOnly.length} system region${plural(systemOnly.length)}, while the key window has ${windowRegions.length}.`,
      });
    } else {
      checks.push({
        id: 'metrics-sync',
        status: 'pass',
        message: `Store regions match the key window (${windowRegions.length} region${plural(windowRegions.length)}).`,
      });
    }
  }
}

function pickPrimaryIOSWindow(windows: unknown[]): Json | null {
  const candidates = windows.filter(isObject);
  const hasMetrics = (w: Json) => parseMetricsObject(w.metrics) !== null;
  return (
    candidates.find(
      (w) => w.isKey === true && w.hidden !== true && hasMetrics(w)
    ) ??
    candidates.find(
      (w) => w.hidden !== true && w.class === 'UIWindow' && hasMetrics(w)
    ) ??
    candidates.find((w) => w.hidden !== true && hasMetrics(w)) ??
    candidates.find(hasMetrics) ??
    null
  );
}

function hasViewControllerMatching(
  node: unknown,
  predicate: (className: string) => boolean
): boolean {
  if (!isObject(node)) return false;
  if (typeof node.class === 'string' && predicate(node.class)) return true;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (hasViewControllerMatching(child, predicate)) return true;
    }
  }
  if (node.presented && hasViewControllerMatching(node.presented, predicate)) {
    return true;
  }
  return false;
}

function deduplicateRects(
  items: readonly { name: string; frame: Rect }[]
): { name: string; frame: Rect }[] {
  const groups: { name: string; frame: Rect }[] = [];
  for (const item of items) {
    const existing = groups.find((g) => overlaps(g.frame, item.frame));
    if (!existing) {
      groups.push(item);
    } else if (
      item.frame.width * item.frame.height >
      existing.frame.width * existing.frame.height
    ) {
      existing.name = item.name;
      existing.frame = item.frame;
    }
  }
  return groups;
}

function sameStructuralRegions(
  a: readonly SafeAreaRegion[],
  b: readonly SafeAreaRegion[]
): boolean {
  if (a.length !== b.length) return false;
  const close = (x: number, y: number) => Math.abs(x - y) <= 0.5;
  return a.every((ra, i) => {
    const rb = b[i]!;
    return (
      ra.kind === rb.kind &&
      ra.edge === rb.edge &&
      ra.side === rb.side &&
      close(ra.frame.x, rb.frame.x) &&
      close(ra.frame.y, rb.frame.y) &&
      close(ra.frame.width, rb.frame.width) &&
      close(ra.frame.height, rb.frame.height)
    );
  });
}

const CHECK_REASON_PRIORITY: readonly [string, SafeAreaUnavailableReason][] = [
  ['ios-sdk', 'ios-sdk-too-old'],
  ['vertical-bar-controls', 'vertical-bar-controls-missing'],
  ['floating-bar-container', 'floating-bar-unrecognized'],
  ['vertical-bar-status', 'status-cluster-unknown'],
  ['android-sources', 'android-sources-missing'],
  ['cutout-refinement', 'android-cutout-unrefined'],
  ['caption-controls', 'android-caption-unrefined'],
  ['window', 'no-metrics'],
];

/** Maps the failing checks of a diagnostic run to a single primary machine-readable reason code. */
export function unavailableReasonFromChecks(
  checks: readonly DiagnosticCheck[],
  liveMetrics?: GranularSafeAreaMetrics | null
): SafeAreaUnavailableReason | null {
  const failed = checks.filter((c) => c.status === 'fail');
  if (failed.length === 0) return null;
  const failedIds = new Set(failed.map((c) => c.id));
  for (const [id, reason] of CHECK_REASON_PRIORITY) {
    if (failedIds.has(id)) return reason;
  }
  if (failedIds.has('metrics-sync')) {
    return liveMetrics === null ? 'no-metrics' : 'metrics-out-of-sync';
  }
  if (failedIds.has('diagnostics')) return 'no-metrics';
  return 'check-failed';
}

function shortClassName(name: string): string {
  for (const pattern of IOS_BAR_CONTROL_CLASSES) {
    if (name.includes(pattern)) return pattern;
  }
  return name;
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRect(v: unknown): Rect | null {
  if (!isObject(v)) return null;
  const { x, y, width, height } = v;
  if (
    typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  ) {
    return { x, y, width, height };
  }
  return null;
}

const REGION_KINDS = new Set<string>([
  'inset',
  'status',
  'cutout',
  'controls',
  'accessory',
  'fold',
]);
const REGION_EDGES = new Set<string>(['top', 'right', 'bottom', 'left']);

function parseRegionList(items: unknown[]): SafeAreaRegion[] {
  const out: SafeAreaRegion[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    if (typeof item.kind !== 'string' || !REGION_KINDS.has(item.kind)) continue;
    const frame = parseRect(item.frame);
    if (!frame) continue;
    const edge =
      typeof item.edge === 'string' && REGION_EDGES.has(item.edge)
        ? (item.edge as Edge)
        : null;
    const side =
      typeof item.side === 'string' && REGION_EDGES.has(item.side)
        ? (item.side as Edge)
        : undefined;
    const owner = typeof item.owner === 'number' ? item.owner : undefined;
    out.push({
      kind: item.kind as SafeAreaRegionKind,
      edge,
      ...(side && { side }),
      frame,
      ...(owner !== undefined && { owner }),
    });
  }
  return out;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((item): item is string => typeof item === 'string')
    : [];
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}
