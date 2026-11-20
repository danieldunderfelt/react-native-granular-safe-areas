import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  type HostInstance,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import {
  buildRegions,
  metricsForSubrect,
  metricsFromInsets,
  rectsEqual,
  ZERO_INSETS,
} from './geometry';
import { parseMetrics } from './metrics';
import {
  BarButtonView,
  getInitialWindowMetricsJSON,
  NativeProviderView,
  refreshNativeProvider,
} from './nativeBridge';
import type { MetricsChangeEvent } from './specs/GranularSafeAreaProviderViewNativeComponent';
import { GranularSafeAreaStore } from './store';
import type { GranularSafeAreaMetrics, Rect } from './types';

/** Holds the nearest provider's store. The value never changes, so it never re-renders consumers by itself. */
export const GranularSafeAreaContext =
  createContext<GranularSafeAreaStore | null>(null);
GranularSafeAreaContext.displayName = 'GranularSafeAreaContext';

export type GranularSafeAreaProviderProps = ViewProps & {
  children?: ReactNode;
  /**
   * Use recorded metrics instead of the platform's, in the provider's coordinate space. For previews and tests; see
   * `fixtures`.
   */
  mock?: GranularSafeAreaMetrics | null;
  /**
   * Break inset bands down into the regions inside them where the platform allows it. `false` makes every region a
   * whole band, the same as a regular safe area. Defaults to `true`.
   */
  refine?: boolean;
};

let initialWindowMetrics: GranularSafeAreaMetrics | null | undefined;
function getInitialWindowMetrics() {
  if (initialWindowMetrics === undefined) {
    initialWindowMetrics = parseMetrics(getInitialWindowMetricsJSON());
  }
  return initialWindowMetrics;
}

export function measureRect(node: HostInstance | null): Rect | null {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
}

/**
 * Measures where the OS draws over this view and shares it with the granular safe-area views and hooks inside it.
 *
 * Render one near the root, inside react-native-safe-area-context's `SafeAreaProvider`, and one inside each modal.
 */
export function GranularSafeAreaProvider({
  children,
  mock,
  refine = true,
  style,
  onLayout,
  ...rest
}: GranularSafeAreaProviderProps) {
  const providerRef = useRef<HostInstance | null>(null);
  const [store] = useState(
    () =>
      new GranularSafeAreaStore(
        () => measureRect(providerRef.current),
        () => refreshNativeProvider(providerRef.current),
        () => providerRef.current
      )
  );
  const [nativeMetrics, setNativeMetrics] =
    useState<GranularSafeAreaMetrics | null>(null);
  const [layout, setLayout] = useState<Rect | null>(null);
  const safeAreaInsets = useContext(SafeAreaInsetsContext);
  const safeAreaFrame = useContext(SafeAreaFrameContext);
  // A nested provider (a modal, a sheet) can sit anywhere, even in another window, so the key window's metrics
  // can't stand in for its first frame.
  const isNested = useContext(GranularSafeAreaContext) !== null;

  const measureSelf = useCallback(() => {
    const rect = measureRect(providerRef.current);
    if (rect) setLayout((prev) => (rectsEqual(prev, rect) ? prev : rect));
  }, []);
  useLayoutEffect(measureSelf, [measureSelf]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      measureSelf();
      store.invalidateLayout();
      onLayout?.(event);
    },
    [measureSelf, store, onLayout]
  );

  const handleMetricsChange = useCallback(
    (event: NativeSyntheticEvent<MetricsChangeEvent>) => {
      const next = parseMetrics(event.nativeEvent.payload);
      if (next) setNativeMetrics(next);
    },
    []
  );

  const metrics = useMemo((): GranularSafeAreaMetrics | null => {
    if (mock) return mock;
    // Reported by the provider's own native view, already in its coordinates.
    if (nativeMetrics) return nativeMetrics;
    if (!layout) return null;
    // Until the native view reports, use the key window's metrics so the first frame is already right. This assumes
    // the root view sits at the window's origin, which holds for the main app view.
    const windowMetrics = isNested ? null : getInitialWindowMetrics();
    if (windowMetrics) return metricsForSubrect(windowMetrics, layout);
    // Platforms without granular metrics: plain bands from react-native-safe-area-context.
    if (safeAreaInsets && safeAreaFrame) {
      return metricsForSubrect(
        metricsFromInsets(
          safeAreaFrame.width,
          safeAreaFrame.height,
          safeAreaInsets
        ),
        {
          ...layout,
          x: layout.x - safeAreaFrame.x,
          y: layout.y - safeAreaFrame.y,
        }
      );
    }
    return metricsFromInsets(layout.width, layout.height, ZERO_INSETS);
  }, [mock, nativeMetrics, layout, isNested, safeAreaInsets, safeAreaFrame]);

  const regions = useMemo(
    () => (metrics ? buildRegions(metrics, { refine }) : []),
    [metrics, refine]
  );
  const bands = useMemo(
    () => (metrics ? buildRegions(metrics, { refine: false }) : []),
    [metrics]
  );

  // Children's layout effects run before this one, so on mount they measure, then measure again here. Both happen
  // before the first frame is painted.
  useLayoutEffect(() => {
    store.publish(regions, metrics, bands);
  }, [store, regions, metrics, bands]);

  return (
    <GranularSafeAreaContext.Provider value={store}>
      <NativeProviderView
        {...rest}
        ref={providerRef}
        style={[styles.fill, style]}
        onLayout={handleLayout}
        onMetricsChange={handleMetricsChange}
      >
        {children}
        <VerticalBarBackButtonHost store={store} />
      </NativeProviderView>
    </GranularSafeAreaContext.Provider>
  );
}

/** Draws the back button a screen put in the vertical bar with `VerticalBarBackButton`, over everything else. */
function VerticalBarBackButtonHost({
  store,
}: {
  store: GranularSafeAreaStore;
}) {
  const button = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().backButton
  );
  if (!button) return null;
  return (
    <BarButtonView
      systemImage={button.icon === 'close' ? 'xmark' : 'chevron.backward'}
      label={button.accessibilityLabel}
      ownerId={store.backButtonOwnerId}
      onBarButtonPress={store.pressBackButton}
      style={[
        styles.barButton,
        {
          left: button.frame.x,
          top: button.frame.y,
          width: button.frame.width,
          height: button.frame.height,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  barButton: { position: 'absolute' },
});
