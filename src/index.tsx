// Everything from react-native-safe-area-context, so one import covers all safe-area needs.
export * from 'react-native-safe-area-context';

export {
  GranularSafeAreaContext,
  GranularSafeAreaProvider,
  type GranularSafeAreaProviderProps,
} from './GranularSafeAreaProvider';
export type { GranularSafeAreaSnapshot, GranularSafeAreaStore } from './store';

// A granular drop-in for react-native-safe-area-context's SafeAreaView. It takes precedence over the re-export above.
export {
  SafeAreaView,
  useSafeAreaViewInsets,
  type SafeAreaViewProps,
} from './SafeAreaView';

// App UI floating over the content, which other views avoid where it's drawn on top of them.
export { SafeAreaAccessory, type SafeAreaAccessoryProps } from './SafeAreaView';

// Insets for a position you describe, applied by you. Plus raw access.
export {
  useGranularSafeAreaMetrics,
  useGranularSafeAreaStore,
  useSafeAreaInsetsFor,
  useSafeAreaRegions,
  type SafeAreaInsetsForOptions,
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
  safeAreaViewInsets,
  verticalBarBackButtonFrame,
  VERTICAL_BAR_ITEM_SIZE,
  type BuildRegionsOptions,
  type ElementInsetsOptions,
  type GranularPlacement,
  type SafeAreaViewInsetsOptions,
  type VerticalBar,
} from './geometry';
export { parseMetrics } from './metrics';
export type {
  GranularInsetsOptions,
  GranularSafeAreaMetrics,
  GranularSafeAreaMode,
  ReservedRegionFrame,
  SafeAreaRegion,
  SafeAreaRegionKind,
  ScrollAxes,
  SystemBarFrame,
} from './types';
