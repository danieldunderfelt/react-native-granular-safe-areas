// Everything from react-native-safe-area-context, so one import covers all safe-area needs. `SafeAreaView` below takes
// precedence over its own.
export * from 'react-native-safe-area-context';

// A granular drop-in for react-native-safe-area-context's SafeAreaView, and app UI other views avoid.
export {
  SafeAreaAccessory,
  SafeAreaDefaults,
  SafeAreaView,
  useSafeAreaStyle,
  useSafeAreaViewInsets,
  useSafeAreaViewStyle,
  type SafeAreaAccessoryProps,
  type SafeAreaDefaultsOptions,
  type SafeAreaStyle,
  type SafeAreaViewProps,
  type UseSafeAreaStyleOptions,
  type UseSafeAreaViewStyleOptions,
} from './SafeAreaView';

// Insets for a position you describe, the regions themselves, device detection, and the strip the system puts its controls in.
export {
  useSafeAreaDevice,
  useSafeAreaInsetsFor,
  useSafeAreaRegions,
  useSystemControls,
  useTabBarEdge,
  type SafeAreaInsetsForOptions,
} from './hooks';
export type {
  SafeAreaDeviceInfo,
  SafeAreaDevicePosture,
  SafeAreaDeviceType,
} from './device';

// The system back button, for screens with a custom header.
export {
  SystemBackButton,
  useSystemBackButton,
  type SystemBackButtonIcon,
  type SystemBackButtonProps,
  type UseSystemBackButtonOptions,
  type UseSystemBackButtonResult,
} from './SystemBackButton';

// Optional: recorded devices, debugging, comparing, and scoping a custom overlay.
export {
  GranularSafeAreaProvider,
  type GranularSafeAreaProviderProps,
} from './GranularSafeAreaProvider';
export {
  GranularSafeAreaDebugOverlay,
  type GranularSafeAreaDebugOverlayProps,
} from './GranularSafeAreaDebugOverlay';
export { fixtures, type FixtureName } from './fixtures';

export { refreshSafeAreas } from './refresh';
export {
  checkDiagnostics,
  getDiagnostics,
  useSafeAreaDiagnostics,
  type CheckDiagnosticsOptions,
  type DiagnosticCheck,
  type DiagnosticCheckStatus,
  type DiagnosticsCheckResult,
  type SafeAreaDiagnosticReport,
  type SafeAreaUnavailableReason,
  type UseSafeAreaDiagnosticsOptions,
  type UseSafeAreaDiagnosticsResult,
} from './diagnostics';

export type { GranularPlacement, SystemControls } from './geometry';
export type {
  EdgeMode,
  EdgeRecord,
  Edges,
  GranularInsetsOptions,
  GranularSafeAreaMetrics,
  GranularSafeAreaMode,
  SafeAreaRegion,
  SafeAreaRegionKind,
  ScrollAxes,
} from './types';
