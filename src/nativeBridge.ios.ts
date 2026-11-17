import type { HostInstance } from 'react-native';
import ProviderView, {
  Commands,
} from './specs/GranularSafeAreaProviderViewNativeComponent';
import NativeGranularSafeAreas from './specs/NativeGranularSafeAreas';

export const NativeProviderView = ProviderView;

export function refreshNativeProvider(view: HostInstance | null) {
  if (view) Commands.refresh(view);
}

export function getInitialWindowMetricsJSON(): string | null {
  return NativeGranularSafeAreas?.getConstants().initialWindowMetrics || null;
}

export function getDiagnosticsJSON(): Promise<string | null> {
  return NativeGranularSafeAreas
    ? NativeGranularSafeAreas.getDiagnostics()
    : Promise.resolve(null);
}
