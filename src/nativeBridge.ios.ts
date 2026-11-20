import type { HostInstance } from 'react-native';
import { parseMetrics } from './metrics';
import NativeAnchor from './specs/GranularSafeAreaAnchorNativeComponent';
import ProviderView, {
  Commands,
} from './specs/GranularSafeAreaProviderViewNativeComponent';
import NativeView from './specs/GranularSafeAreaViewNativeComponent';
import NativeGranularSafeAreas from './specs/NativeGranularSafeAreas';
import type { GranularSafeAreaMetrics, ScrollAxes } from './types';

export const NativeProviderView = ProviderView;
export const AnchorView = NativeAnchor;
/** Measures itself natively, and follows its own position when it's dynamic. */
export const NativeSafeAreaView: typeof NativeView | null = NativeView;

/** The system back button is drawn natively, by its anchor, in its own screen. */
export const nativeHostsBackButton = true;

export function BackButtonStandIn(_props: {
  systemImage: string;
  label?: string;
  onPress: () => unknown;
}) {
  return null;
}

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

/**
 * Follows the app's window, for apps without a provider: an empty view behind everything in the window reports its
 * metrics, the way a provider reports its own.
 */
export function observeWindowMetrics(
  listener: (metrics: GranularSafeAreaMetrics) => void
): () => void {
  if (!NativeGranularSafeAreas) return () => {};
  const subscription = NativeGranularSafeAreas.onWindowMetricsChange((json) => {
    const metrics = parseMetrics(json);
    if (metrics) listener(metrics);
  });
  NativeGranularSafeAreas.observeWindow();
  return () => subscription.remove();
}

export function refreshWindowMetrics() {
  NativeGranularSafeAreas?.refreshWindow();
}

export function getDiagnosticsJSON(): Promise<string | null> {
  return NativeGranularSafeAreas
    ? NativeGranularSafeAreas.getDiagnostics()
    : Promise.resolve(null);
}
