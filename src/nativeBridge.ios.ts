import type { HostInstance } from 'react-native';
import type { ScrollAxes } from './types';
import NativeAnchor from './specs/GranularSafeAreaAnchorNativeComponent';
import NativeBarButton from './specs/GranularSafeAreaBarButtonNativeComponent';
import ProviderView, {
  Commands,
} from './specs/GranularSafeAreaProviderViewNativeComponent';
import NativeGranularSafeAreas from './specs/NativeGranularSafeAreas';
import NativeView from './specs/GranularSafeAreaViewNativeComponent';

export const NativeProviderView = ProviderView;
export const BarButtonView = NativeBarButton;
export const AnchorView = NativeAnchor;
/** Measures itself natively, and follows its own position when it's dynamic. */
export const NativeSafeAreaView: typeof NativeView | null = NativeView;

export const canTrackScrollFromJS = false;

export function subscribeToScroll(_listener: () => unknown): () => void {
  return () => {};
}

export function scrollAxesOf(
  _node: HostInstance | null,
  _provider: HostInstance | null
): ScrollAxes | null {
  return null;
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
