import {
  EDGES,
  overlaps,
  resolveVerticalBarEdge,
  usesVerticalBarForControls,
} from './geometry';
import type { Edge, GranularSafeAreaMetrics, Rect } from './types';

/** Why granular safe areas are unavailable or fell back to whole-band avoidance. */
export type SafeAreaUnavailableReason =
  | 'native-unavailable'
  | 'no-metrics'
  | 'platform-unsupported'
  | 'os-unsupported'
  | 'ios-sdk-too-old'
  | 'status-cluster-unknown'
  | 'floating-bar-unrecognized'
  | 'vertical-bar-controls-missing'
  | 'metrics-out-of-sync'
  | 'android-sources-missing'
  | 'android-cutout-unrefined'
  | 'android-caption-unrefined'
  | 'check-failed';

export type SafeAreaFallbackInfo = {
  reason: SafeAreaUnavailableReason;
  message: string;
  /**
   * `true` when granular safe areas failed to register or refine on a supported platform/OS (worth reporting to
   * external logging like Datadog); `false` for expected platform/OS limits such as web or older iOS versions.
   */
  isIssue: boolean;
};

const TOLERANCE = 0.5;

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

export function parseOSVersion(version: unknown): [number, number] | null {
  if (typeof version !== 'string') return null;
  const parts = version.split('.');
  const major = Number(parts[0]);
  const minor = Number(parts[1] ?? 0);
  return Number.isFinite(major) && Number.isFinite(minor)
    ? [major, minor]
    : null;
}

export function isVersionAtLeast(
  version: [number, number],
  major: number,
  minor: number
): boolean {
  return version[0] > major || (version[0] === major && version[1] >= minor);
}

/**
 * Inspects a metrics snapshot for synchronous fallback conditions where granular safe areas are unavailable and the
 * library falls back to whole safe-area bands. Returns `null` when granular safe areas are available.
 */
export function detectMetricsFallback(
  metrics: GranularSafeAreaMetrics
): SafeAreaFallbackInfo | null {
  if (metrics.platform === 'web') {
    return {
      reason: 'platform-unsupported',
      message: 'Granular safe areas are not available on web.',
      isIssue: false,
    };
  }

  if (metrics.platform === 'android') {
    const sources = metrics.android;
    if (!sources) {
      return {
        reason: 'android-sources-missing',
        message:
          'Android inset source breakdown (bars, caption, cutout) is unavailable.',
        isIssue: true,
      };
    }

    for (const edge of EDGES) {
      const size = metrics.insets[edge];
      if (size <= 0) continue;
      const cutoutOnly =
        sources.bars[edge] <= 0 &&
        sources.caption[edge] <= 0 &&
        sources.cutout[edge] + TOLERANCE >= size;
      if (cutoutOnly) {
        const band = bandRect(edge, size, metrics.width, metrics.height);
        const hasCamera = metrics.occlusions.some(
          (o) => o.active && overlaps(o, band)
        );
        if (!hasCamera) {
          return {
            reason: 'android-cutout-unrefined',
            message: `Display cutout on the ${edge} edge reported no camera bounds.`,
            isIssue: true,
          };
        }
      }
    }

    if (
      metrics.insets.top > 0 &&
      sources.captionTransparent &&
      sources.bars.top <= 0 &&
      sources.cutout.top <= 0 &&
      sources.caption.top + TOLERANCE >= metrics.insets.top
    ) {
      const band = bandRect(
        'top',
        metrics.insets.top,
        metrics.width,
        metrics.height
      );
      const hasButtons = metrics.systemBars.some((b) => overlaps(b, band));
      if (!hasButtons) {
        return {
          reason: 'android-caption-unrefined',
          message: 'Transparent caption bar reported no window button bounds.',
          isIssue: true,
        };
      }
    }

    return null;
  }

  // iOS
  const version = parseOSVersion(metrics.systemVersion);
  if (!metrics.reservedRegionsSupported) {
    if (version && isVersionAtLeast(version, 27, 1)) {
      return {
        reason: 'ios-sdk-too-old',
        message: `Running on iOS ${metrics.systemVersion}, but built without the iOS 27.1+ SDK; reserved regions and vertical-bar refinement are disabled.`,
        isIssue: true,
      };
    }
    // iPadOS 26+ supports corner-adapted window controls even before iOS 27.1.
    const hasIPadGranular =
      Boolean(metrics.windowControls) ||
      (metrics.idiom === 'pad' &&
        version !== null &&
        isVersionAtLeast(version, 26, 0));
    if (!hasIPadGranular) {
      return {
        reason: 'os-unsupported',
        message: metrics.systemVersion
          ? `Granular safe areas require iOS 27.1+ (running iOS ${metrics.systemVersion}).`
          : 'Granular safe areas are not supported by this OS or build.',
        isIssue: false,
      };
    }
    return null;
  }

  const barEdge = resolveVerticalBarEdge(metrics);
  if (barEdge) {
    const size = metrics.insets[barEdge];
    const band = bandRect(barEdge, size, metrics.width, metrics.height);
    const hasBarRegionTop =
      metrics.barRegionInsets !== null && metrics.barRegionInsets.top >= 0;
    const hasRealStatusBar =
      metrics.statusBar !== null &&
      metrics.statusBar.width >= 10 &&
      metrics.statusBar.height >= 10 &&
      overlaps(metrics.statusBar, band);
    if (!hasBarRegionTop && !hasRealStatusBar) {
      return {
        reason: 'status-cluster-unknown',
        message: `Nothing reported where the status cluster ends on the ${barEdge} vertical bar.`,
        isIssue: true,
      };
    }
    if (
      usesVerticalBarForControls(metrics) &&
      metrics.barContainersVisible &&
      !metrics.barItemsKnown
    ) {
      const hasVerticalBar = metrics.systemBars.some((bar) => {
        const centerX = bar.x + bar.width / 2;
        return (
          bar.width <= band.width + 1 &&
          centerX >= band.x &&
          centerX <= band.x + band.width
        );
      });
      if (!hasVerticalBar) {
        return {
          reason: 'floating-bar-unrecognized',
          message: `UIKit bar containers are visible on the ${barEdge} edge, but no floating bar items were recognized.`,
          isIssue: true,
        };
      }
    }
  }

  return null;
}

const warnedKeys = new Set<string>();

/** Logs a deduplicated dev-mode warning when granular safe areas are unavailable and band avoidance is active. */
export function warnGranularUnavailable(
  reason: SafeAreaUnavailableReason,
  message: string,
  details?: Record<string, unknown>
) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const key = `${reason}:${message}`;
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  const text = `react-native-granular-safe-areas: ${message} Falling back to band avoidance.`;
  if (details) {
    console.warn(text, details);
  } else {
    console.warn(text);
  }
}

/** @internal Clears dev-warning deduplication state between unit tests. */
export function resetDevWarnings() {
  warnedKeys.clear();
}
