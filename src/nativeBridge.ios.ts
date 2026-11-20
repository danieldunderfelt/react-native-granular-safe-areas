import type { HostInstance } from 'react-native';
import NativeAnchor from './specs/GranularSafeAreaAnchorNativeComponent';
import NativeBarButton from './specs/GranularSafeAreaBarButtonNativeComponent';
import NativeDynamicView from './specs/GranularSafeAreaDynamicViewNativeComponent';
import ProviderView, {
  Commands,
} from './specs/GranularSafeAreaProviderViewNativeComponent';
import NativeGranularSafeAreas from './specs/NativeGranularSafeAreas';

export const NativeProviderView = ProviderView;
export const BarButtonView = NativeBarButton;
export const AnchorView = NativeAnchor;
/** Follows its own position natively, so `dynamic` views need nothing from JS while they move. */
export const DynamicView: typeof NativeDynamicView | null = NativeDynamicView;

export const canTrackScrollFromJS = false;

export function subscribeToScroll(_listener: () => unknown): () => void {
  return () => {};
}

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
