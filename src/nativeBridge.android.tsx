import {
  Pressable,
  StyleSheet,
  View,
  type HostInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { parseMetrics } from './metrics';
import NativeAnchor from './specs/GranularSafeAreaAnchorNativeComponent';
import ProviderView, {
  Commands,
} from './specs/GranularSafeAreaProviderViewNativeComponent';
import NativeView from './specs/GranularSafeAreaViewNativeComponent';
import NativeGranularSafeAreas from './specs/NativeGranularSafeAreas';
import type { GranularSafeAreaMetrics, ScrollAxes } from './types';

// Android: the same native components as on iOS. The provider reports the window's insets broken down by what the
// system draws there, and `SafeAreaView` measures itself natively, following itself as it moves when it's dynamic.

export const NativeProviderView = ProviderView;
/** Reports whether its screen is attached to a window. Android has no system back button slot, so it never shows one. */
export const AnchorView = NativeAnchor;
/** Measures itself natively, and follows its own position when it's dynamic. */
export const NativeSafeAreaView: typeof NativeView | null = NativeView;

/** Android has no place for a system back button; for mocked layouts, the provider draws a stand-in. */
export const nativeHostsBackButton = false;

/** A stand-in for the iPhone Duo's glass back button, for layouts mocked with its metrics. */
export function BackButtonStandIn({
  systemImage,
  label,
  onPress,
  style,
}: {
  systemImage: string;
  label?: string;
  onPress: () => unknown;
  style?: StyleProp<ViewStyle>;
}) {
  const close = systemImage === 'xmark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [style, styles.button, pressed && styles.pressed]}
    >
      {close ? (
        <>
          <View style={[styles.line, styles.lineA]} />
          <View style={[styles.line, styles.lineB]} />
        </>
      ) : (
        <View style={styles.chevron} />
      )}
    </Pressable>
  );
}

/** Scrolling is followed natively. */
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

/** Follows the app's window, for apps without a provider: the activity's window reports its metrics. */
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

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    elevation: 2,
  },
  pressed: { opacity: 0.6 },
  chevron: {
    width: 12,
    height: 12,
    marginLeft: 5,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#1c1c1e',
    transform: [{ rotate: '45deg' }],
  },
  line: {
    position: 'absolute',
    width: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#1c1c1e',
  },
  lineA: { transform: [{ rotate: '45deg' }] },
  lineB: { transform: [{ rotate: '-45deg' }] },
});
