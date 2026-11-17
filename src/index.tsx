// Everything from react-native-safe-area-context, so one import covers all safe-area needs.
export * from 'react-native-safe-area-context';

export {
  GranularSafeAreaContext,
  GranularSafeAreaProvider,
  type GranularSafeAreaProviderProps,
} from './GranularSafeAreaProvider';
export type { GranularSafeAreaSnapshot, GranularSafeAreaStore } from './store';

// Automatic: measure an element and apply its insets.
export {
  GranularSafeAreaView,
  type GranularSafeAreaViewProps,
} from './GranularSafeAreaView';
export {
  useGranularSafeArea,
  type GranularSafeAreaProps,
  type UseGranularSafeAreaOptions,
  type UseGranularSafeAreaResult,
} from './useGranularSafeArea';

// Manual: insets for a position you describe, applied by you. Plus raw access.
export {
  useGranularSafeAreaInsets,
  useGranularSafeAreaMetrics,
  useGranularSafeAreaStore,
  useSafeAreaRegions,
} from './hooks';

export {
  GranularSafeAreaDebugOverlay,
  type GranularSafeAreaDebugOverlayProps,
} from './GranularSafeAreaDebugOverlay';
export { getDiagnostics } from './diagnostics';
export { fixtures, type FixtureName } from './fixtures';
export {
  buildRegions,
  computeElementInsets,
  metricsForSubrect,
  placementToRect,
  sweepRegions,
  type BuildRegionsOptions,
  type ElementInsetsOptions,
  type GranularPlacement,
} from './geometry';
export { parseMetrics } from './metrics';
export type {
  GranularInsetsOptions,
  GranularSafeAreaMetrics,
  GranularSafeAreaMode,
  GranularSafeAreaOptions,
  ReservedRegionFrame,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';
