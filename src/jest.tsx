// A stand-in for the library in Jest tests, where there's no native side:
//
//   jest.mock('react-native-granular-safe-areas', () => require('react-native-granular-safe-areas/jest'));
//
// By default it's a device with nothing to avoid: views render as plain `View`s with no insets, hooks return no regions
// and zero insets, and the system back button shows your own. Give it recorded metrics to test a layout such as the
// iPhone Duo's, for one subtree or for the whole test:
//
//   <GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>…</GranularSafeAreaProvider>
//   mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait); // from 'react-native-granular-safe-areas/jest'
//
// Then the hooks compute what they would on that device (regions, system controls, `useSafeAreaInsetsFor`,
// `useTabBarEdge`), and `SystemBackButton` hides your button where the system shows its own, rendering a pressable
// stand-in with the test ID `SystemBackButton` that calls the `onPress` of the screen that would get it. Views still
// render as plain `View`s: nothing is laid out in Jest, so there's nothing for them to measure.
//
// Everything from react-native-safe-area-context comes through as is; mock it as its README says.
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { fixtures } from './fixtures';
import {
  activeEdges,
  buildRegions,
  edgeModes,
  getTabBarEdge,
  getVerticalBar,
  placementToRect,
  safeAreaViewInsets,
  ZERO_INSETS,
  type GranularPlacement,
  type SystemControls,
} from './geometry';
import type { SafeAreaInsetsForOptions } from './hooks';
import type {
  SafeAreaAccessoryProps,
  SafeAreaDefaultsOptions,
  SafeAreaStyle,
  SafeAreaViewProps,
} from './SafeAreaView';
import { GranularSafeAreaStore } from './store';
import type {
  SystemBackButtonProps,
  UseSystemBackButtonOptions,
  UseSystemBackButtonResult,
} from './SystemBackButton';
import type {
  Edge,
  EdgeInsets,
  GranularSafeAreaMetrics,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';

export * from 'react-native-safe-area-context';
export { fixtures };

function createStore(metrics: GranularSafeAreaMetrics | null) {
  const store = new GranularSafeAreaStore(
    () => null,
    () => {}
  );
  publish(store, metrics);
  return store;
}

function publish(
  store: GranularSafeAreaStore,
  metrics: GranularSafeAreaMetrics | null,
  granular = true
) {
  store.publish(
    metrics ? buildRegions(metrics, { granular }) : [],
    metrics,
    metrics ? buildRegions(metrics, { granular: false }) : []
  );
}

const defaultStore = createStore(null);

const KEPT_SPACE = { opacity: 0 };

/**
 * Lays out every hook and component outside a `GranularSafeAreaProvider` for these metrics, such as one of `fixtures`,
 * until it's called again. `null` goes back to a device with nothing to avoid; call that in `afterEach`.
 */
export function mockSafeAreaMetrics(metrics: GranularSafeAreaMetrics | null) {
  publish(defaultStore, metrics);
}

const StoreContext = createContext<GranularSafeAreaStore>(defaultStore);

function useStore() {
  return useContext(StoreContext);
}

function useSnapshot() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

function viewProps({
  edges: _edges,
  mode: _mode,
  avoid: _avoid,
  spacing: _spacing,
  gap: _gap,
  granular: _granular,
  dynamic: _dynamic,
  underlying: _underlying,
  onInsetsChange: _onInsetsChange,
  ...props
}: SafeAreaViewProps): ViewProps {
  return props;
}

export function SafeAreaView(props: SafeAreaViewProps) {
  return <View {...viewProps(props)} />;
}

export function SafeAreaAccessory({
  edge: _edge,
  ...props
}: SafeAreaAccessoryProps) {
  return <View {...viewProps(props)} />;
}

export function SafeAreaDefaults({
  children,
}: SafeAreaDefaultsOptions & { children?: ReactNode }) {
  return <>{children}</>;
}

export function useSafeAreaViewInsets(): EdgeInsets {
  return ZERO_INSETS;
}

const NO_STYLE: SafeAreaStyle = Object.freeze({
  style: null,
  insets: ZERO_INSETS,
  probe: <></>,
});

export function useSafeAreaStyle(): SafeAreaStyle {
  return NO_STYLE;
}

/** Computed from the mocked metrics, as on the device; zero without any. */
export function useSafeAreaInsetsFor(
  placement: GranularPlacement = {},
  options: SafeAreaInsetsForOptions = {}
): EdgeInsets {
  const { metrics, regions, bands } = useSnapshot();
  const { top, right, bottom, left, width, height } = placement;
  const edgesKey = activeEdges(edgeModes(options.edges)).join(',');
  const avoidKey = (options.avoid ?? []).join(',');
  const hasAvoid = options.avoid !== undefined;
  const { spacing = 0, granular = false, scrollable } = options;
  return useMemo(() => {
    if (!metrics) return ZERO_INSETS;
    return safeAreaViewInsets(
      placementToRect({ top, right, bottom, left, width, height }, metrics),
      {
        regions,
        bands,
        granular,
        scroll: {
          vertical: scrollable === 'vertical',
          horizontal: scrollable === 'horizontal',
        },
        edges: edgesKey ? (edgesKey.split(',') as Edge[]) : [],
        ...(hasAvoid && {
          avoid: (avoidKey ? avoidKey.split(',') : []) as SafeAreaRegionKind[],
        }),
        spacing,
        bounds: metrics,
      }
    );
  }, [
    metrics,
    regions,
    bands,
    top,
    right,
    bottom,
    left,
    width,
    height,
    edgesKey,
    avoidKey,
    hasAvoid,
    spacing,
    granular,
    scrollable,
  ]);
}

export function useSafeAreaRegions(): readonly SafeAreaRegion[] {
  return useSnapshot().regions;
}

export function useSystemControls(): SystemControls | null {
  return useSnapshot().systemControls;
}

export function useTabBarEdge(): Edge {
  return getTabBarEdge(useSnapshot().metrics);
}

/**
 * As on the device: the most recently mounted enabled one is shown where the mocked metrics have a place for it. Every
 * mounted screen counts as showing; use `enabled` for one that isn't.
 */
export function useSystemBackButton({
  onPress,
  enabled = true,
  icon = 'back',
  accessibilityLabel = icon === 'close' ? 'Close' : 'Back',
}: UseSystemBackButtonOptions): UseSystemBackButtonResult {
  const store = useStore();
  const [id] = useState(() => store.createBackButtonId());
  const onPressRef = useRef(onPress);
  useLayoutEffect(() => {
    onPressRef.current = onPress;
  });
  const initial = useRef({ enabled, icon, accessibilityLabel });
  useLayoutEffect(() => {
    store.registerBackButton(id, {
      ...initial.current,
      onPress: () => onPressRef.current(),
      inWindow: true,
    });
    return () => store.unregisterBackButton(id);
  }, [store, id]);
  useLayoutEffect(() => {
    store.updateBackButton(id, { enabled, icon, accessibilityLabel });
  }, [store, id, enabled, icon, accessibilityLabel]);
  const state = useSyncExternalStore(store.subscribe, () => {
    const button = store.getSnapshot().backButton;
    return button?.owner === id ? button : null;
  });
  const button: ReactElement = state ? (
    <Pressable
      testID="SystemBackButton"
      accessibilityRole="button"
      accessibilityLabel={state.accessibilityLabel}
      onPress={store.pressBackButton}
    />
  ) : (
    <View />
  );
  return { shown: state !== null, button };
}

export function SystemBackButton({
  children,
  keepSpace = false,
  ...options
}: SystemBackButtonProps) {
  const { shown, button } = useSystemBackButton(options);
  if (keepSpace) {
    return (
      <>
        {button}
        <View
          style={shown ? KEPT_SPACE : undefined}
          pointerEvents={shown ? 'none' : 'auto'}
          accessibilityElementsHidden={shown}
          importantForAccessibility={shown ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
      </>
    );
  }
  return (
    <>
      {button}
      {shown ? null : children}
    </>
  );
}

/**
 * Lays out what's inside for `mock`, or else for the metrics around it. Its other props are ignored, as there's
 * nothing to measure.
 */
export function GranularSafeAreaProvider({
  children,
  mock,
  granular = true,
}: {
  children?: ReactNode;
  mock?: GranularSafeAreaMetrics | null;
  granular?: boolean;
}) {
  const outer = useStore();
  const inherited = useSyncExternalStore(
    outer.subscribe,
    () => outer.getSnapshot().metrics
  );
  const metrics = mock ?? inherited;
  // Created with the metrics, so the first render is already right; changes are published as they come.
  const [store] = useState(() => {
    const created = createStore(null);
    publish(created, metrics, granular);
    return created;
  });
  useLayoutEffect(() => {
    publish(store, metrics, granular);
  }, [store, metrics, granular]);
  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

/**
 * `useSystemHeaderItems` from `/native-stack` and `/expo-router`: `shown` where the mocked metrics have a vertical bar.
 * It leaves the screen's options alone. Map those entries here too:
 *
 *   jest.mock('react-native-granular-safe-areas/native-stack', () => require('react-native-granular-safe-areas/jest'));
 */
export function useSystemHeaderItems({
  enabled = true,
}: { enabled?: boolean } = {}): { shown: boolean } {
  const { metrics } = useSnapshot();
  return {
    shown: enabled && metrics !== null && getVerticalBar(metrics) !== null,
  };
}

export function GranularSafeAreaDebugOverlay() {
  return null;
}

export function refreshSafeAreas() {}

export function getDiagnostics(): Promise<Record<string, unknown> | null> {
  return Promise.resolve(null);
}
