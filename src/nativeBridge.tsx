import type { Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type HostInstance,
} from 'react-native';
import type { NativeProps as AnchorProps } from './specs/GranularSafeAreaAnchorNativeComponent';
import type { NativeProps as BarButtonProps } from './specs/GranularSafeAreaBarButtonNativeComponent';
import type NativeDynamicView from './specs/GranularSafeAreaDynamicViewNativeComponent';
import type { NativeProps } from './specs/GranularSafeAreaProviderViewNativeComponent';

// Platforms without native granular metrics yet (web, Android). The provider falls back to the regular insets from
// react-native-safe-area-context, so everything behaves like a regular safe area.

export function NativeProviderView({
  onMetricsChange: _onMetricsChange,
  ...props
}: NativeProps & { ref?: Ref<HostInstance> }) {
  return <View {...props} />;
}

/** Always "in a window": without native support, the most recently registered back button wins. */
export function AnchorView({
  onWindowChange: _onWindowChange,
  ...props
}: AnchorProps) {
  return <View {...props} />;
}

/** A stand-in for the native glass button, so mocked layouts (web previews) show it too. */
export function BarButtonView({
  systemImage,
  label,
  onBarButtonPress,
  style,
}: BarButtonProps) {
  const close = systemImage === 'xmark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onBarButtonPress?.({} as never)}
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

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
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

/** No native tracking: `dynamic` views measure themselves from JS instead, where JS can see scrolling. */
export const DynamicView: typeof NativeDynamicView | null = null;

/** Whether {@link subscribeToScroll} reports anything: on the web, not on Android. */
export const canTrackScrollFromJS = Platform.OS === 'web';

type ScrollTarget = {
  addEventListener(
    type: 'scroll',
    listener: () => void,
    options: { capture: boolean; passive: boolean }
  ): void;
  removeEventListener(
    type: 'scroll',
    listener: () => void,
    options: { capture: boolean }
  ): void;
};

const scrollListeners = new Set<() => unknown>();
let scrollFrame: number | null = null;

function handleScroll() {
  if (scrollFrame !== null) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    for (const listener of [...scrollListeners]) listener();
  });
}

/**
 * Web: calls `listener` once per frame while anything on the page scrolls. One capturing listener on the document
 * serves every subscriber. On Android, scrolling can't be observed from JS, so it never calls it.
 */
export function subscribeToScroll(listener: () => unknown): () => void {
  const target = (globalThis as { document?: ScrollTarget }).document;
  if (!target) return () => {};
  if (scrollListeners.size === 0) {
    target.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true,
    });
  }
  scrollListeners.add(listener);
  return () => {
    scrollListeners.delete(listener);
    if (scrollListeners.size === 0) {
      target.removeEventListener('scroll', handleScroll, { capture: true });
    }
  };
}

export function refreshNativeProvider(_view: HostInstance | null) {}

export function getInitialWindowMetricsJSON(): string | null {
  return null;
}

export function getDiagnosticsJSON(): Promise<string | null> {
  return Promise.resolve(null);
}
