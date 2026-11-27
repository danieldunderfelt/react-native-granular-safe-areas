import { detectMetricsFallback } from './fallback';
import { resolveVerticalBarEdge } from './geometry';
import type { GranularSafeAreaMetrics } from './types';

/** Broad device form factor derived from the platform's safe-area metrics. */
export type SafeAreaDeviceType =
  'phone' | 'tablet' | 'foldable' | 'desktop' | 'web' | 'unknown';

/** Current physical or windowing posture of the device. */
export type SafeAreaDevicePosture =
  'standard' | 'folded' | 'unfolded' | 'half-opened' | 'windowed';

/** Device classification and granular safe-area capability reported by `useSafeAreaDevice()`. */
export type SafeAreaDeviceInfo = {
  /** Form factor: `'phone'`, `'tablet'`, `'foldable'`, `'desktop'`, `'web'`, or `'unknown'` before metrics arrive. */
  type: SafeAreaDeviceType;
  /** Current posture: `'folded'`, `'unfolded'`, `'half-opened'`, `'windowed'`, or `'standard'`. */
  posture: SafeAreaDevicePosture;
  /** Platform the metrics came from, or `'unknown'` before metrics arrive. */
  platform: 'ios' | 'android' | 'web' | 'unknown';
  /** `true` when the system places vertical bars along a side edge (e.g. iPhone Duo closed, or open in landscape). */
  hasVerticalBar: boolean;
  /** `true` when the display reports a fold/hinge division (even when flat/unfolded). */
  hasFold: boolean;
  /** `true` when a fold/hinge is currently active (e.g. half-opened / book / tabletop posture). */
  isFoldActive: boolean;
  /**
   * `true` when granular safe-area refinement is available and active. `false` on web, when the native module is
   * unavailable, on unsupported OS/SDK combinations, or while fallen back to band avoidance.
   */
  granularSupported: boolean;
  /** Hardware model identifier reported by the native side (e.g. `'iPhone19,4'`, `'Google Pixel 10'`), or `null`. */
  model: string | null;
  /** OS version reported by the native side (e.g. `'27.2'` on iOS, `'37'` on Android), or `null`. */
  systemVersion: string | null;
  /** Platform UI idiom when reported (`'phone'` or `'pad'`), or `null`. */
  idiom: 'phone' | 'pad' | null;
};

export type GetDeviceInfoOptions = {
  /** Whether runtime band-avoidance fallback is currently forced on the store. */
  fallbackToBands?: boolean;
  /** Optional platform override when `metrics` is `null`. */
  platform?: 'ios' | 'android' | 'web' | 'unknown';
  /** Optional hardware model fallback (e.g. from native diagnostics when metrics didn't include it). */
  model?: string | null;
  /** Optional OS version fallback (e.g. from native diagnostics when metrics didn't include it). */
  systemVersion?: string | null;
};

export const UNKNOWN_DEVICE: SafeAreaDeviceInfo = Object.freeze({
  type: 'unknown',
  posture: 'standard',
  platform: 'unknown',
  hasVerticalBar: false,
  hasFold: false,
  isFoldActive: false,
  granularSupported: false,
  model: null,
  systemVersion: null,
  idiom: null,
});

/**
 * Classifies the device form factor, posture, and granular safe-area capability from platform metrics.
 */
export function getDeviceInfo(
  metrics: GranularSafeAreaMetrics | null,
  options: GetDeviceInfoOptions = {}
): SafeAreaDeviceInfo {
  const model = metrics?.deviceModel ?? options.model ?? null;
  const systemVersion = metrics?.systemVersion ?? options.systemVersion ?? null;

  if (!metrics) {
    const platform = options.platform ?? 'unknown';
    if (platform === 'unknown' && model === null && systemVersion === null) {
      return UNKNOWN_DEVICE;
    }
    return {
      ...UNKNOWN_DEVICE,
      type: platform === 'web' ? 'web' : 'unknown',
      platform,
      model,
      systemVersion,
    };
  }

  if (metrics.platform === 'web') {
    return {
      type: 'web',
      posture: 'standard',
      platform: 'web',
      hasVerticalBar: false,
      hasFold: false,
      isFoldActive: false,
      granularSupported: false,
      model,
      systemVersion,
      idiom: null,
    };
  }

  const hasFold = metrics.divisions.length > 0;
  const isFoldActive = metrics.divisions.some((d) => d.active);
  const hasVerticalBar = resolveVerticalBarEdge(metrics) !== null;
  const idiom = metrics.idiom ?? null;

  const fallback =
    options.fallbackToBands === true
      ? true
      : detectMetricsFallback(metrics) !== null;
  const granularSupported = !fallback;

  let type: SafeAreaDeviceType;
  let posture: SafeAreaDevicePosture;

  if (hasFold) {
    type = 'foldable';
    posture = isFoldActive ? 'half-opened' : 'unfolded';
  } else if (metrics.platform === 'ios' && metrics.verticalBarEdge !== null) {
    type = 'foldable';
    posture = 'folded';
  } else if (metrics.platform === 'ios') {
    if (idiom === 'pad') {
      type = 'tablet';
      posture = metrics.windowControls ? 'windowed' : 'standard';
    } else {
      type = 'phone';
      posture = 'standard';
    }
  } else {
    const isWindowed = (metrics.android?.caption.top ?? 0) > 0;
    const isLarge =
      idiom === 'pad' || Math.min(metrics.width, metrics.height) >= 600;
    if (isWindowed) {
      posture = 'windowed';
      type =
        idiom === 'pad' ? 'tablet' : idiom === 'phone' ? 'phone' : 'desktop';
    } else {
      posture = 'standard';
      type = isLarge ? 'tablet' : 'phone';
    }
  }

  return {
    type,
    posture,
    platform: metrics.platform,
    hasVerticalBar,
    hasFold,
    isFoldActive,
    granularSupported,
    model,
    systemVersion,
    idiom,
  };
}

export function deviceInfoEqual(
  a: SafeAreaDeviceInfo,
  b: SafeAreaDeviceInfo
): boolean {
  return (
    a.type === b.type &&
    a.posture === b.posture &&
    a.platform === b.platform &&
    a.hasVerticalBar === b.hasVerticalBar &&
    a.hasFold === b.hasFold &&
    a.isFoldActive === b.isFoldActive &&
    a.granularSupported === b.granularSupported &&
    a.model === b.model &&
    a.systemVersion === b.systemVersion &&
    a.idiom === b.idiom
  );
}
