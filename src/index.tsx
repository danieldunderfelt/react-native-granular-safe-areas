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

// The vertical bar: a native back button for custom headers, and the bar's layout.
export {
  useVerticalBar,
  useVerticalBarBackButton,
  VerticalBarBackButton,
  type UseVerticalBarBackButtonOptions,
  type UseVerticalBarBackButtonResult,
  type VerticalBarBackButtonProps,
} from './VerticalBar';
export type {
  VerticalBarBackButtonIcon,
  VerticalBarBackButtonState,
} from './store';

export {
  GranularSafeAreaDebugOverlay,
  type GranularSafeAreaDebugOverlayProps,
} from './GranularSafeAreaDebugOverlay';
export { getDiagnostics } from './diagnostics';
export { fixtures, type FixtureName } from './fixtures';
export {
  buildRegions,
  computeElementInsets,
  getVerticalBar,
  metricsForSubrect,
  placementToRect,
  sweepRegions,
  verticalBarBackButtonFrame,
  VERTICAL_BAR_ITEM_SIZE,
  type BuildRegionsOptions,
  type ElementInsetsOptions,
  type GranularPlacement,
  type VerticalBar,
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
