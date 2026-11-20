import type { Ref } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type HostInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { metricsFromInsets, ZERO_INSETS } from './geometry';
import type { NativeProps as AnchorProps } from './specs/GranularSafeAreaAnchorNativeComponent';
import type NativeView from './specs/GranularSafeAreaViewNativeComponent';
import type { EdgeInsets, GranularSafeAreaMetrics, ScrollAxes } from './types';
import type { NativeProps } from './specs/GranularSafeAreaProviderViewNativeComponent';

// Platforms without native granular metrics yet (web, Android). The provider falls back to the regular insets from
// react-native-safe-area-context, so everything behaves like a regular safe area.

export function NativeProviderView({
  onMetricsChange: _onMetricsChange,
  ...props
}: NativeProps & { ref?: Ref<HostInstance> }) {
  return <View {...props} />;
}

/**
 * Always "in a window": without native support, the most recently registered back button wins. It doesn't draw the
 * button: the provider draws {@link BackButtonStandIn} instead.
 */
export function AnchorView({
  onWindowChange: _onWindowChange,
  onButtonPress: _onButtonPress,
  button: _button,
  ...props
}: AnchorProps) {
  return <View {...props} />;
}

/** Whether the system back button is drawn natively, in its own screen. Elsewhere the provider draws a stand-in. */
export const nativeHostsBackButton = false;

/** A stand-in for the native glass button, so mocked layouts (web previews) show it too. */
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

/** No native view yet: `SafeAreaView` measures itself from JS. */
export const NativeSafeAreaView: typeof NativeView | null = null;

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

type DomElement = {
  parentElement: DomElement | null;
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
};
type DomWindow = {
  getComputedStyle(element: DomElement): {
    overflowX: string;
    overflowY: string;
  };
};

const SCROLLING = new Set(['auto', 'scroll']);

/**
 * Web: which way the elements between `node` and the provider scroll, read from the DOM (React Native Web's `ScrollView` doesn't
 * provide `ScrollView.Context`). `null` elsewhere.
 */
export function scrollAxesOf(
  node: HostInstance | null,
  provider: HostInstance | null
): ScrollAxes | null {
  const view = (globalThis as { window?: DomWindow }).window;
  if (Platform.OS !== 'web' || !view || !node) return null;
  const axes = { vertical: false, horizontal: false };
  // Scrolling above the provider moves it along with the element, so it changes nothing.
  const stop = provider as unknown as DomElement | null;
  let element = (node as unknown as DomElement).parentElement;
  while (element && element !== stop) {
    const { overflowX, overflowY } = view.getComputedStyle(element);
    if (SCROLLING.has(overflowY) && element.scrollHeight > element.clientHeight)
      axes.vertical = true;
    if (SCROLLING.has(overflowX) && element.scrollWidth > element.clientWidth)
      axes.horizontal = true;
    element = element.parentElement;
  }
  return axes;
}

export function refreshNativeProvider(_view: HostInstance | null) {}

type WebDocument = {
  body: { appendChild(node: unknown): void; removeChild(node: unknown): void };
  createElement(tag: 'div'): { style: { cssText: string } };
};
type WebWindow = {
  innerWidth: number;
  innerHeight: number;
  getComputedStyle(node: unknown): Record<string, string>;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
};

/** The web: the browser's safe-area insets, read from `env(safe-area-inset-*)`. */
function webInsets(document: WebDocument, view: WebWindow): EdgeInsets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = view.getComputedStyle(probe);
  document.body.removeChild(probe);
  const read = (value: string | undefined) => parseFloat(value ?? '') || 0;
  return {
    top: read(style.paddingTop),
    right: read(style.paddingRight),
    bottom: read(style.paddingBottom),
    left: read(style.paddingLeft),
  };
}

/**
 * Follows the app's window, for apps without a provider: its size and regular insets. The web reads the browser's;
 * Android, until it has native support, react-native-safe-area-context's.
 */
export function observeWindowMetrics(
  listener: (metrics: GranularSafeAreaMetrics) => void
): () => void {
  const globals = globalThis as { document?: WebDocument; window?: WebWindow };
  if (Platform.OS === 'web' && globals.document && globals.window) {
    const document = globals.document;
    const view = globals.window;
    const report = () =>
      listener(
        metricsFromInsets(
          view.innerWidth,
          view.innerHeight,
          webInsets(document, view),
          'web'
        )
      );
    report();
    view.addEventListener('resize', report);
    return () => view.removeEventListener('resize', report);
  }
  const report = () => {
    const { width, height } = Dimensions.get('window');
    listener(
      metricsFromInsets(
        width,
        height,
        initialWindowMetrics?.insets ?? ZERO_INSETS,
        Platform.OS === 'android' ? 'android' : 'web'
      )
    );
  };
  report();
  const subscription = Dimensions.addEventListener('change', report);
  return () => subscription.remove();
}

export function refreshWindowMetrics() {}

export function getInitialWindowMetricsJSON(): string | null {
  return null;
}

export function getDiagnosticsJSON(): Promise<string | null> {
  return Promise.resolve(null);
}
