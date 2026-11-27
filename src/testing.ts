// The building blocks behind the components and hooks: the geometry, the metrics, and the store. For tests, previews and
// tools; apps don't need them.
export {
  buildRegions,
  computeElementInsets,
  getSystemControls,
  getTabBarEdge,
  metricsForSubrect,
  metricsFromInsets,
  placementToRect,
  safeAreaViewInsets,
  type BuildRegionsOptions,
  type ElementInsetsOptions,
  type GranularPlacement,
  type SafeAreaViewInsetsOptions,
  type SystemControls,
} from './geometry';
export {
  getDeviceInfo,
  type GetDeviceInfoOptions,
  type SafeAreaDeviceInfo,
  type SafeAreaDevicePosture,
  type SafeAreaDeviceType,
} from './device';
export {
  detectMetricsFallback,
  type SafeAreaFallbackInfo,
  type SafeAreaUnavailableReason,
} from './fallback';
export {
  checkDiagnostics,
  type CheckDiagnosticsOptions,
  type DiagnosticCheck,
  type DiagnosticCheckStatus,
  type DiagnosticsCheckResult,
} from './diagnosticsCheck';
export { parseMetrics } from './metrics';
export { fixtures, type FixtureName } from './fixtures';
export { useGranularSafeAreaMetrics, useGranularSafeAreaStore } from './hooks';
export type { GranularSafeAreaSnapshot, GranularSafeAreaStore } from './store';
export type {
  GranularSafeAreaMetrics,
  ReservedRegionFrame,
  SafeAreaRegion,
  SystemBarFrame,
} from './types';
