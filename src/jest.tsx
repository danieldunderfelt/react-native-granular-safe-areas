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
// `useTabBarEdge`), `SafeAreaView`, `SafeAreaAccessory`, `SafeAreaDefaults`, `useSafeAreaStyle`,
// `useSafeAreaViewInsets` and `useSafeAreaViewStyle` apply the mocked metrics' band insets (supporting `padding`,
// `margin`, `offset`, `none`, `gap` and `onInsetsChange`), and `SystemBackButton` hides your button where the system
// shows its own, rendering a pressable stand-in with the test ID `SystemBackButton` that calls the `onPress` of the
// screen that would get it, and carries its `icon` and the SF Symbol the system would draw (`systemImage`).
// `useSystemHeaderItems` returns `shown`, and `getSystemHeaderItems()` gives the items the system would show, to check
// and press.
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
import {
  Pressable,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  checkDiagnostics,
  type CheckDiagnosticsOptions,
  type DiagnosticCheck,
  type DiagnosticCheckStatus,
  type DiagnosticsCheckResult,
} from './diagnosticsCheck';
import type {
  SafeAreaDeviceInfo,
  SafeAreaDevicePosture,
  SafeAreaDeviceType,
} from './device';
import type {
  SafeAreaDiagnosticReport,
  UseSafeAreaDiagnosticsOptions,
  UseSafeAreaDiagnosticsResult,
} from './diagnosticsHook';
import type { SafeAreaUnavailableReason } from './fallback';
import { fixtures } from './fixtures';
import {
  activeEdges,
  buildRegions,
  edgeModes,
  getTabBarEdge,
  getVerticalBar,
  insetsEqual,
  placementToRect,
  safeAreaViewInsets,
  ZERO_INSETS,
  type GranularPlacement,
  type SystemControls,
} from './geometry';
import type { SafeAreaInsetsForOptions } from './hooks';
import {
  mergeDefaults,
  resolveSafeAreaProps,
  type SafeAreaDefaultsOptions,
} from './resolveProps';
import type {
  SafeAreaAccessoryProps,
  SafeAreaStyle,
  SafeAreaViewProps,
  UseSafeAreaStyleOptions,
  UseSafeAreaViewStyleOptions,
} from './SafeAreaView';
import { backButtonSystemImage, GranularSafeAreaStore } from './store';
import { flattenStyle, layoutAdjustment, offsetStyle, ownEdges } from './style';
import type {
  SystemBackButtonProps,
  UseSystemBackButtonOptions,
  UseSystemBackButtonResult,
} from './SystemBackButton';
import type {
  Edge,
  EdgeInsets,
  EdgeMode,
  GranularSafeAreaMetrics,
  GranularSafeAreaMode,
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
  if (metrics === null) {
    // Drop default-store header entries so an unmounted tree whose cleanup was skipped by a synchronous `act` cannot
    // leak into later tests. Any component still mounted re-registers when `defaultStore` notifies it next.
    for (let i = headerEntries.length - 1; i >= 0; i--) {
      if (headerEntries[i]!.store === defaultStore) {
        headerEntries.splice(i, 1);
      }
    }
  }
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

const SafeAreaDefaultsContext = createContext<SafeAreaDefaultsOptions>({});

export function SafeAreaDefaults({
  children,
  ...defaults
}: SafeAreaDefaultsOptions & { children?: ReactNode }) {
  const parent = useContext(SafeAreaDefaultsContext);
  const key = JSON.stringify(defaults);
  const value = useMemo(
    () => mergeDefaults(parent, defaults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent, key]
  );
  return (
    <SafeAreaDefaultsContext.Provider value={value}>
      {children}
    </SafeAreaDefaultsContext.Provider>
  );
}

type SafeAreaViewInsetsContextValue = {
  insets: EdgeInsets;
  modes: Readonly<Record<Edge, EdgeMode>>;
};

const DEFAULT_INSETS_CONTEXT: SafeAreaViewInsetsContextValue = Object.freeze({
  insets: ZERO_INSETS,
  modes: edgeModes(undefined),
});

const SafeAreaViewInsetsContext = createContext<SafeAreaViewInsetsContextValue>(
  DEFAULT_INSETS_CONTEXT
);

function computeBandInsets(
  metrics: GranularSafeAreaMetrics | null,
  regions: readonly SafeAreaRegion[],
  bands: readonly SafeAreaRegion[],
  {
    edges,
    avoid,
    spacing = 0,
    mode = 'padding',
    style,
  }: {
    edges: readonly Edge[];
    avoid?: readonly SafeAreaRegionKind[];
    spacing?: number;
    mode?: GranularSafeAreaMode;
    style?: StyleProp<ViewStyle>;
  }
): EdgeInsets {
  if (!metrics) return ZERO_INSETS;
  let rect = placementToRect({}, metrics);
  if (mode === 'margin' && style) {
    // On device, a view's own margin sits outside its laid-out box, so the overlap is measured from inside it.
    // Shrinking the simulated box by the view's own margin gives the exact same result here (including `gap`).
    const own = ownEdges(flattenStyle(style), 'margin');
    const left = typeof own.left.value === 'number' ? own.left.value : 0;
    const top = typeof own.top.value === 'number' ? own.top.value : 0;
    const right = typeof own.right.value === 'number' ? own.right.value : 0;
    const bottom = typeof own.bottom.value === 'number' ? own.bottom.value : 0;
    rect = {
      x: left,
      y: top,
      width: Math.max(0, metrics.width - left - right),
      height: Math.max(0, metrics.height - top - bottom),
    };
  }
  return safeAreaViewInsets(rect, {
    regions,
    bands,
    granular: false,
    edges,
    ...(avoid !== undefined && { avoid }),
    spacing,
    bounds: metrics,
  });
}

function useMockBandStyle({
  edges,
  mode = 'padding',
  avoid,
  spacing = 0,
  style,
  onInsetsChange,
}: Pick<
  SafeAreaViewProps,
  'edges' | 'mode' | 'avoid' | 'spacing' | 'style' | 'onInsetsChange'
>) {
  const { metrics, regions, bands } = useSnapshot();
  const modes = edgeModes(edges);
  const insets = computeBandInsets(metrics, regions, bands, {
    edges: activeEdges(modes),
    avoid,
    spacing,
    mode,
    style,
  });
  const reported = useRef<EdgeInsets | null>(null);
  const onInsetsChangeRef = useRef(onInsetsChange);
  useLayoutEffect(() => {
    onInsetsChangeRef.current = onInsetsChange;
  });
  useLayoutEffect(() => {
    if (!metrics && !reported.current) return;
    if (reported.current && insetsEqual(reported.current, insets)) return;
    reported.current = insets;
    onInsetsChangeRef.current?.(insets);
  }, [metrics, insets]);

  const adjusted =
    mode === 'padding' || mode === 'margin'
      ? layoutAdjustment(style, insets, mode, modes).style
      : mode === 'offset'
        ? offsetStyle(style, insets)
        : null;

  return { insets, modes, adjusted };
}

function stripViewProps({
  edges: _edges,
  mode: _mode,
  avoid: _avoid,
  spacing: _spacing,
  granular: _granular,
  dynamic: _dynamic,
  avoidScrollingEdges: _avoidScrollingEdges,
  underlying: _underlying,
  onInsetsChange: _onInsetsChange,
  ...props
}: Omit<SafeAreaViewProps, 'gap'>): ViewProps {
  return props;
}

export function SafeAreaView(props: SafeAreaViewProps) {
  const resolved = resolveSafeAreaProps(
    props,
    useContext(SafeAreaDefaultsContext)
  );
  const { mode = 'padding', style, children } = resolved;
  const { insets, modes, adjusted } = useMockBandStyle(resolved);
  const childInsets = mode === 'offset' ? ZERO_INSETS : insets;
  const contextValue = useMemo(
    () => ({ insets: childInsets, modes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      childInsets.top,
      childInsets.right,
      childInsets.bottom,
      childInsets.left,
      modes.top,
      modes.right,
      modes.bottom,
      modes.left,
    ]
  );
  const viewProps = stripViewProps(resolved);
  return (
    <View {...viewProps} style={adjusted ? [style, adjusted] : style}>
      <SafeAreaViewInsetsContext.Provider value={contextValue}>
        {children}
      </SafeAreaViewInsetsContext.Provider>
    </View>
  );
}

export function SafeAreaAccessory({
  edge: _edge,
  ...props
}: SafeAreaAccessoryProps) {
  return <SafeAreaView {...props} />;
}

export function useSafeAreaViewInsets(): EdgeInsets {
  return useContext(SafeAreaViewInsetsContext).insets;
}

export function useSafeAreaViewStyle(
  style?: StyleProp<ViewStyle>,
  options?: UseSafeAreaViewStyleOptions
): ViewStyle | null {
  const { insets, modes } = useContext(SafeAreaViewInsetsContext);
  const mode = options?.mode ?? 'padding';
  const resolvedModes =
    options?.edges !== undefined ? edgeModes(options.edges) : modes;
  return layoutAdjustment(style, insets, mode, resolvedModes, true).style;
}

const EMPTY_PROBE: ReactElement = <></>;

export function useSafeAreaStyle(
  options: UseSafeAreaStyleOptions = {}
): SafeAreaStyle {
  const resolved = resolveSafeAreaProps(
    options,
    useContext(SafeAreaDefaultsContext)
  );
  const { insets, adjusted } = useMockBandStyle(resolved);
  return {
    style: adjusted,
    insets,
    probe: EMPTY_PROBE,
  };
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
  const {
    spacing = 0,
    granular = false,
    avoidScrollingEdges = false,
    scrollable,
  } = options;
  return useMemo(() => {
    if (!metrics) return ZERO_INSETS;
    return safeAreaViewInsets(
      placementToRect({ top, right, bottom, left, width, height }, metrics),
      {
        regions,
        bands,
        granular,
        avoidScrollingEdges,
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
    avoidScrollingEdges,
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

export function useSafeAreaDevice(): SafeAreaDeviceInfo {
  return useSnapshot().device;
}

export function useSafeAreaDiagnostics(
  options: UseSafeAreaDiagnosticsOptions = {}
): UseSafeAreaDiagnosticsResult {
  const { device, fallbackToBands } = useSnapshot();
  const checkNow = (): Promise<SafeAreaDiagnosticReport> => {
    const report: SafeAreaDiagnosticReport = {
      ok: true,
      reason: null,
      summary: 'Jest mock active; native diagnostics skipped.',
      platform: device.platform,
      device,
      fallbackToBands,
      checks: [],
      failedChecks: [],
      timestamp: new Date().toISOString(),
      ...(options.includeDiagnostics ? { diagnostics: null } : {}),
    };
    options.onCheck?.(report);
    return Promise.resolve(report);
  };
  return { report: null, fallbackActive: fallbackToBands, checkNow };
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
      // What the system would draw, for tests to check: passed through to the host view.
      {...({
        icon: state.icon,
        systemImage: backButtonSystemImage(state.icon),
      } as object)}
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

/** An item as the mock sees it: whatever you passed, loosely typed so tests can read labels and call handlers. */
export type MockSystemHeaderItem = {
  type?: string;
  label?: string;
  onPress?: () => void;
  [key: string]: any;
};

/** What `getSystemHeaderItems()` returns: the controls the system would show for the screen. */
export type MockSystemHeaderItems<Item = MockSystemHeaderItem> = {
  headerRightItems: readonly Item[];
  headerLeftItems: readonly Item[];
  /** Whether UIKit's back button would show (where there's a screen to go back to). */
  headerBackVisible: boolean;
};

type MockHeaderOptions = {
  headerRightItems?: readonly unknown[];
  headerLeftItems?: readonly unknown[];
  headerBackVisible?: boolean;
  enabled?: boolean;
};

type HeaderEntry = {
  options: MockHeaderOptions;
  shown: boolean;
  store: GranularSafeAreaStore;
};

/** Every mounted `useSystemHeaderItems`, oldest first. */
const headerEntries: HeaderEntry[] = [];

/**
 * `useSystemHeaderItems` from `/native-stack` and `/expo-router`: `shown` where the mocked metrics have a vertical bar.
 * It leaves the screen's options alone and needs no navigation; read what the system would show with
 * `getSystemHeaderItems()`. Map those entries here too:
 *
 *   jest.mock('react-native-granular-safe-areas/native-stack', () => require('react-native-granular-safe-areas/jest'));
 *   jest.mock('react-native-granular-safe-areas/expo-router', () => require('react-native-granular-safe-areas/jest'));
 */
export function useSystemHeaderItems(options: MockHeaderOptions = {}): {
  shown: boolean;
} {
  const store = useStore();
  const { metrics, fallbackToBands } = useSnapshot();
  const bar = !fallbackToBands && metrics ? getVerticalBar(metrics) : null;
  const shown =
    (options.enabled ?? true) && bar !== null && bar.acceptsControls;
  // Register and update synchronously during render so `getSystemHeaderItems()` still works even when a prior
  // synchronous `act` left layout effects unflushed in the same test file.
  const entry = useRef<HeaderEntry | null>(null);
  if (entry.current === null) {
    entry.current = { options, shown, store };
  } else {
    entry.current.options = options;
    entry.current.shown = shown;
    entry.current.store = store;
  }
  if (!headerEntries.includes(entry.current)) {
    headerEntries.push(entry.current);
  }
  useLayoutEffect(() => {
    const current = entry.current!;
    if (!headerEntries.includes(current)) {
      headerEntries.push(current);
    }
    return () => {
      const index = headerEntries.indexOf(current);
      if (index !== -1) headerEntries.splice(index, 1);
    };
  }, []);
  return { shown };
}

function isHeaderEntryActive(entry: HeaderEntry): boolean {
  if (!entry.shown) return false;
  const { metrics, fallbackToBands } = entry.store.getSnapshot();
  const bar = !fallbackToBands && metrics ? getVerticalBar(metrics) : null;
  return bar !== null && bar.acceptsControls;
}

function wrapHeaderItem<Item>(item: Item): Item {
  if (!item || typeof item !== 'object') return item;
  const record = item as Record<string, unknown>;
  let changed = false;
  const copy: Record<string, unknown> = { ...record };
  if (typeof record.onPress === 'function') {
    const fn = record.onPress as (...args: unknown[]) => unknown;
    // Match UIKit and `fireEvent.press` (void return) so `act(() => item.onPress())` never returns a Promise into
    // React 19's synchronous `act`, which would otherwise leave `actScopeDepth` stuck and break later tests in the file.
    copy.onPress = (...args: unknown[]): void => {
      fn(...args);
    };
    changed = true;
  }
  if (record.menu && typeof record.menu === 'object') {
    const menu = record.menu as Record<string, unknown>;
    if (Array.isArray(menu.items)) {
      copy.menu = { ...menu, items: menu.items.map(wrapHeaderItem) };
      changed = true;
    }
  }
  if (Array.isArray(record.items)) {
    copy.items = record.items.map(wrapHeaderItem);
    changed = true;
  }
  return changed ? (copy as Item) : item;
}

/**
 * The items the system would show in its own controls, as the screen passed them to `useSystemHeaderItems`, with its
 * latest handlers: from the most recently mounted screen whose items are shown. `null` when none is, such as without
 * Duo metrics. Call a handler in `act`:
 *
 * ```tsx
 * mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait);
 * render(<TripDetails />);
 * const share = getSystemHeaderItems()?.headerRightItems.find((item) => item.label === 'Share');
 * act(() => {
 *   share!.onPress!();
 * });
 * ```
 */
export function getSystemHeaderItems<
  Item = MockSystemHeaderItem,
>(): MockSystemHeaderItems<Item> | null {
  for (let i = headerEntries.length - 1; i >= 0; i--) {
    const entry = headerEntries[i]!;
    if (!isHeaderEntryActive(entry)) continue;
    const { options } = entry;
    return {
      headerRightItems: (options.headerRightItems ?? []).map((item) =>
        wrapHeaderItem(item as Item)
      ),
      headerLeftItems: (options.headerLeftItems ?? []).map((item) =>
        wrapHeaderItem(item as Item)
      ),
      headerBackVisible: options.headerBackVisible ?? true,
    };
  }
  return null;
}

export function GranularSafeAreaDebugOverlay() {
  return null;
}

export function refreshSafeAreas() {}

export function getDiagnostics(): Promise<Record<string, unknown> | null> {
  return Promise.resolve(null);
}

export {
  checkDiagnostics,
  type CheckDiagnosticsOptions,
  type DiagnosticCheck,
  type DiagnosticCheckStatus,
  type DiagnosticsCheckResult,
  type SafeAreaAccessoryProps,
  type SafeAreaDefaultsOptions,
  type SafeAreaDeviceInfo,
  type SafeAreaDevicePosture,
  type SafeAreaDeviceType,
  type SafeAreaDiagnosticReport,
  type SafeAreaStyle,
  type SafeAreaUnavailableReason,
  type SafeAreaViewProps,
  type UseSafeAreaDiagnosticsOptions,
  type UseSafeAreaDiagnosticsResult,
  type UseSafeAreaStyleOptions,
  type UseSafeAreaViewStyleOptions,
};
