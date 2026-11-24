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
