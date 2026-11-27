import { createElement, type Ref } from 'react';
import { Dimensions, View, type HostInstance } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { metricsFromInsets, ZERO_INSETS } from './geometry';
import { parseMetrics } from './metrics';
import NativeAnchor, {
  type NativeProps as AnchorProps,
} from './specs/GranularSafeAreaAnchorNativeComponent';
import ProviderView, {
  Commands,
  type NativeProps as ProviderProps,
} from './specs/GranularSafeAreaProviderViewNativeComponent';
import NativeView from './specs/GranularSafeAreaViewNativeComponent';
import NativeGranularSafeAreas from './specs/NativeGranularSafeAreas';
import type { GranularSafeAreaMetrics, ScrollAxes } from './types';

/** `true` when the native GranularSafeAreas module is linked and available at runtime. */
export const isNativeModuleAvailable = NativeGranularSafeAreas != null;

function FallbackProviderView({
  onMetricsChange: _onMetricsChange,
  ...props
}: ProviderProps & { ref?: Ref<HostInstance> }) {
  return createElement(View, props);
}

function FallbackAnchorView({
  onWindowChange: _onWindowChange,
  onButtonPress: _onButtonPress,
  button: _button,
  ...props
}: AnchorProps) {
  return createElement(View, props);
}

export const NativeProviderView = isNativeModuleAvailable
  ? ProviderView
  : FallbackProviderView;
export const AnchorView = isNativeModuleAvailable
  ? NativeAnchor
  : FallbackAnchorView;
/** Measures itself natively, and follows its own position when it's dynamic. */
export const NativeSafeAreaView: typeof NativeView | null =
  isNativeModuleAvailable ? NativeView : null;

/** The system back button is drawn natively, by its anchor, in its own screen. */
export const nativeHostsBackButton = isNativeModuleAvailable;

export { BackButtonStandIn } from './BackButtonStandIn';

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
  if (isNativeModuleAvailable && view) Commands.refresh(view);
}

export function getInitialWindowMetricsJSON(): string | null {
  return NativeGranularSafeAreas?.getConstants().initialWindowMetrics || null;
}

/**
 * Follows the app's window, for apps without a provider: an empty view behind everything in the window reports its
 * metrics, the way a provider reports its own. Falls back to window dimensions and `initialWindowMetrics` bands when
 * the native module isn't linked.
 */
export function observeWindowMetrics(
  listener: (metrics: GranularSafeAreaMetrics) => void
): () => void {
  if (!NativeGranularSafeAreas) {
    const report = () => {
      const { width, height } = Dimensions.get('window');
      listener(
        metricsFromInsets(
          width,
          height,
          initialWindowMetrics?.insets ?? ZERO_INSETS,
          'ios'
        )
      );
    };
    report();
    const subscription = Dimensions.addEventListener('change', report);
    return () => subscription.remove();
  }
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
