import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import {
  View,
  type HostInstance,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import {
  activeEdges,
  DEFAULT_AVOID,
  edgeMask,
  edgeModes,
  EDGES,
  insetsEqual,
  NO_SCROLL,
  safeAreaViewInsets,
  trackedRegions,
  ZERO_INSETS,
  type TrackedRegion,
} from './geometry';
import { measureRect } from './GranularSafeAreaProvider';
import { accessoryRegion, type AccessoryOptions } from './accessory';
import { areRelated, isDrawnAbove } from './drawOrder';
import { useGranularSafeAreaStore } from './hooks';
import { useMeasuredSafeArea } from './measured';
import { NativeSafeAreaView } from './nativeBridge';
import { createOwnerId } from './owners';
import { useScrollViewAxes } from './scrollContext';
import type {
  AccessoryChangeEvent,
  InsetsChangeEvent,
} from './specs/GranularSafeAreaViewNativeComponent';
import type { GranularSafeAreaStore } from './store';
import { layoutAdjustment } from './style';
import type {
  Edge,
  EdgeInsets,
  EdgeMode,
  Edges,
  GranularInsetsOptions,
  GranularSafeAreaMode,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';

export type SafeAreaViewProps = ViewProps &
  GranularInsetsOptions & {
    ref?: Ref<HostInstance>;
    /**
     * Edges the view may be pushed in from, as in react-native-safe-area-context: a list of edges, or an object with
     * `'additive'` (add the inset to the view's own padding or margin), `'maximum'` (use whichever is larger) or
     * `'off'` per edge. Defaults to all four, additive.
     */
    edges?: Edges;
    /** How the insets are applied: `padding` (default), `margin`, `offset` or `none`. */
    mode?: GranularSafeAreaMode;
    /**
     * Follow the view as it moves, and avoid only the regions it overlaps right now: a badge on a scrolling card
     * moves in while it passes the OS UI. Movement is a design decision, so it's opt-in. Implies `granular`.
     *
     * On iOS the view follows itself natively, in the same frame as whatever moved it: scrolling, layout, gestures,
     * screen transitions, Reanimated and Animated. `offset` is applied natively too; `padding` and `margin` change
     * layout, so they follow a frame or two later. Defaults to `false`.
     */
    dynamic?: boolean;
    /**
     * Also avoid app UI drawn beneath the view: bars and accessories of the screen under a sheet or overlay. By default
     * a view only avoids what's drawn on top of it, so a sheet's content ignores the tab bar it covers. Set this for a
     * transparent overlay that should keep clear of it anyway, such as a toast that sits above the tab bar.
     */
    underlying?: boolean;
    /** Called with the view's insets, once measured and whenever they change. */
    onInsetsChange?: (insets: EdgeInsets) => void;
  };

export type SafeAreaAccessoryProps = SafeAreaViewProps & {
  /**
   * The edge the accessory belongs to: content beneath it moves away from that edge to clear it. Defaults to the
   * screen edge it's closest to.
   */
  edge?: Edge;
};

/**
 * A drop-in for react-native-safe-area-context's `SafeAreaView` that measures where it is and insets itself only as
 * much as it needs there, from what can actually cover it: system UI (the status bar, cameras, the home indicator),
 * and app UI drawn on top of it (bars, accessories). A sheet or modal is drawn on top of the screen beneath it, so its
 * content ignores that screen's tab bar.
 *
 * - By default it avoids the whole inset band on each edge it overlaps, like a regular safe area. A band runs the
 *   full length of its edge, so the view stays clear of the OS UI wherever it moves along it, such as down a list.
 * - `granular` avoids only the regions it overlaps where it's laid out: a header next to the iPhone Duo's status
 *   cluster moves in, a button in the free stretch of the column stays at the edge.
 * - `dynamic` follows the view as it moves and avoids only what it overlaps right now.
 *
 * It measures when it mounts, when its layout changes and when the OS UI changes. In a scroll view, the edges it
 * scrolls towards are left to the scroll view's content inset. Its children can read its insets with
 * `useSafeAreaViewInsets`.
 */
export function SafeAreaView(props: SafeAreaViewProps) {
  return <SafeAreaViewImpl {...props} />;
}

/**
 * App UI floating over the content, such as a boarding pass button, a mini player, or a tab bar you draw yourself. It's
 * a `SafeAreaView` (so it keeps clear of the OS UI itself), and other views avoid it where it's drawn on top of them:
 * content in the same screen moves clear of it, while a sheet or modal on top of it ignores it.
 *
 * ```tsx
 * <SafeAreaAccessory granular mode="offset" style={styles.boardingPass}>
 *   <BoardingPassButton />
 * </SafeAreaAccessory>
 * ```
 */
export function SafeAreaAccessory({ edge, ...props }: SafeAreaAccessoryProps) {
  const [owner] = useState(createOwnerId);
  const accessory = useMemo(() => ({ owner, edge }), [owner, edge]);
  return <SafeAreaViewImpl {...props} accessory={accessory} />;
}

const SafeAreaViewInsetsContext = createContext<EdgeInsets>(ZERO_INSETS);
SafeAreaViewInsetsContext.displayName = 'SafeAreaViewInsetsContext';

/**
 * The insets of the nearest `SafeAreaView` (or `SafeAreaAccessory`) around the component, for content that applies
 * them itself, such as a list in a sheet:
 *
 * ```tsx
 * <SafeAreaView mode="none" edges={['bottom']} style={{ flex: 1 }}>
 *   <List /> // const { bottom } = useSafeAreaViewInsets(); contentContainerStyle={{ paddingBottom: bottom }}
 * </SafeAreaView>
 * ```
 *
 * The view measures its own box, so its insets fit what's around the list: in a sheet only the home indicator, in a
 * tab screen the tab bar and any accessories too. Zero outside a `SafeAreaView`, and for one in `offset` mode, which
 * moves as a whole.
 */
export function useSafeAreaViewInsets(): EdgeInsets {
  return useContext(SafeAreaViewInsetsContext);
}

export type ImplProps = SafeAreaViewProps & { accessory?: AccessoryOptions };

function SafeAreaViewImpl(props: ImplProps) {
  return NativeSafeAreaView ? (
    <NativeBackedSafeAreaView {...props} />
  ) : (
    <MeasuredSafeAreaView {...props} />
  );
}

/** The edge modes for `edges`, the same object for as long as they don't change. */
function useEdgeModes(edges: Edges | undefined) {
  const modes = edgeModes(edges);
  const key = EDGES.map((edge) => modes[edge]).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => modes, [key]);
}

/** Takes an accessory's region out of the store when it unmounts. */
function useAccessoryCleanup(
  store: GranularSafeAreaStore,
  accessory: AccessoryOptions | undefined
) {
  const owner = accessory?.owner;
  useEffect(() => {
    if (owner === undefined) return undefined;
    return () => {
      store.setAccessory(owner, null);
      store.setAccessoryNode(owner, null);
    };
  }, [store, owner]);
}

/** What `useNativeSafeArea` needs: everything about a view except how it applies its insets. */
export type NativeSafeAreaOptions = Pick<
  ImplProps,
  | 'edges'
  | 'avoid'
  | 'spacing'
  | 'granular'
  | 'dynamic'
  | 'underlying'
  | 'onInsetsChange'
  | 'accessory'
  | 'ref'
>;

export type NativeSafeArea = {
  /** Props for the native view, except how it applies the insets (`applyOffset`, `reportInsets`, `margins`). */
  props: {
    ref: (node: HostInstance | null) => void;
    regions: TrackedRegion[];
    bands: TrackedRegion[];
    edges: number;
    granular: boolean;
    dynamic: boolean;
    underlying: boolean;
    initialInsets: EdgeInsets;
    ownerId: number;
    onAccessoryChange?: (
      event: NativeSyntheticEvent<AccessoryChangeEvent>
    ) => void;
  };
  /** The edge modes `edges` asks for. */
  modes: Readonly<Record<Edge, EdgeMode>>;
  /** The insets: the first measurement from JS, then what the native side reports. */
  insets: EdgeInsets;
  /** Takes the insets the native side reported. */
  report: (insets: EdgeInsets) => void;
};

/**
 * Everything a native-backed view needs from JS: the regions it avoids, its first measurement from React Native's
 * layout (so the first frame is right before the native side can measure), and its accessory region. `SafeAreaView`
 * and `AnimatedSafeAreaView` differ only in how they apply the insets.
 */
export function useNativeSafeArea({
  edges,
  avoid,
  spacing = 0,
  granular = false,
  dynamic = false,
  underlying = false,
  onInsetsChange,
  accessory,
  ref: forwardedRef,
}: NativeSafeAreaOptions): NativeSafeArea {
  const store = useGranularSafeAreaStore();
  const modes = useEdgeModes(edges);
  const avoidKey = (avoid ?? DEFAULT_AVOID).join(',');

  // The regions tell even a view that avoids whole bands which bands have something in them that covers it.
  const regions = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().regions
  );
  const bands = useSyncExternalStore(store.subscribe, () =>
    dynamic ? NO_REGIONS : store.getSnapshot().bands
  );
  const nativeRegions = useMemo(
    () =>
      trackedRegions(regions, {
        avoid: avoidKey.split(',') as SafeAreaRegionKind[],
        spacing,
      }),
    [regions, avoidKey, spacing]
  );
  const nativeBands = useMemo(
    () =>
      trackedRegions(bands, {
        avoid: avoidKey.split(',') as SafeAreaRegionKind[],
        spacing,
      }),
    [bands, avoidKey, spacing]
  );

  const [insets, setInsets] = useState<EdgeInsets>(ZERO_INSETS);
  const onInsetsChangeRef = useRef(onInsetsChange);
  useLayoutEffect(() => {
    onInsetsChangeRef.current = onInsetsChange;
  });
  const report = useCallback((next: EdgeInsets) => {
    setInsets((previous) => (insetsEqual(previous, next) ? previous : next));
    onInsetsChangeRef.current?.(next);
  }, []);

  // An accessory tells the store where it's drawn, for the region it takes.
  useAccessoryCleanup(store, accessory);
  const handleAccessoryChange = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<AccessoryChangeEvent>) => {
      if (!accessory) return;
      const { visible, x, y, width, height } = nativeEvent;
      store.setAccessory(
        accessory.owner,
        visible
          ? accessoryRegion(store, accessory, { x, y, width, height })
          : null
      );
    },
    [store, accessory]
  );

  // Measure once from JS, from React Native's layout, so the first frame is already right. The native side starts
  // from this, and takes over as soon as it can measure itself: in a screen that's still transitioning in, that's
  // once the transition is done.
  const ref = useRef<HostInstance | null>(null);
  const setRef = useMergedRef(ref, forwardedRef);
  const scroll = useScrollViewAxes();
  const [initialInsets, setInitialInsets] = useState<EdgeInsets>(ZERO_INSETS);
  useLayoutEffect(() => {
    if (accessory) store.setAccessoryNode(accessory.owner, ref.current);
    const snapshot = store.getSnapshot();
    const node = ref.current;
    const element = measureRect(node);
    const provider = store.getProviderRect();
    if (!snapshot.metrics || !node || !element || !provider) return;
    // Accessories cover the view only when they're drawn on top of it, which the order of the tree tells. UIKit bars
    // are assumed to; the native side knows for sure.
    const covers = (owner: number) => {
      const other = store.getAccessoryNode(owner);
      if (!other) return true;
      return underlying ? !areRelated(other, node) : isDrawnAbove(other, node);
    };
    const initial = safeAreaViewInsets(
      { ...element, x: element.x - provider.x, y: element.y - provider.y },
      {
        regions: snapshot.regions,
        bands: snapshot.bands,
        granular,
        dynamic,
        covers,
        scroll: scroll ?? NO_SCROLL,
        edges: activeEdges(modes),
        avoid: avoidKey.split(',') as SafeAreaRegionKind[],
        spacing,
        bounds: snapshot.metrics,
      }
    );
    setInitialInsets(initial);
    report(initial);
    // Only on mount: afterwards the native side is the one source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New elements usually mean navigation, which can change the system bars.
  useEffect(() => {
    store.requestRefresh();
  }, [store]);

  return {
    props: {
      ref: setRef,
      regions: nativeRegions,
      bands: nativeBands,
      edges: edgeMask(activeEdges(modes)),
      granular,
      dynamic,
      underlying,
      initialInsets,
      ownerId: accessory?.owner ?? 0,
      onAccessoryChange: accessory ? handleAccessoryChange : undefined,
    },
    modes,
    insets,
    report,
  };
}

/** iOS: measures itself natively. JS hands it the regions, and applies padding and margin when told to. */
function NativeBackedSafeAreaView({
  edges,
  mode = 'padding',
  avoid,
  spacing,
  granular,
  dynamic,
  underlying,
  onInsetsChange,
  accessory,
  style,
  children,
  ref,
  ...rest
}: ImplProps) {
  const NativeView = NativeSafeAreaView!;
  const native = useNativeSafeArea({
    edges,
    avoid,
    spacing,
    granular,
    dynamic,
    underlying,
    onInsetsChange,
    accessory,
    ref,
  });
  const { report } = native;
  const handleInsetsChange = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<InsetsChangeEvent>) => {
      const { top, right, bottom, left } = nativeEvent;
      report({ top, right, bottom, left });
    },
    [report]
  );

  // Padding, margin and none: the native side reports the insets, JS applies them or hands them to the children.
  const reported = mode !== 'offset';
  const adjustment =
    mode === 'padding' || mode === 'margin'
      ? layoutAdjustment(style, native.insets, mode, native.modes)
      : null;
  return (
    <NativeView
      {...rest}
      {...native.props}
      applyOffset={mode === 'offset'}
      reportInsets={reported || onInsetsChange !== undefined}
      margins={mode === 'margin' ? adjustment?.added : ZERO_INSETS}
      onInsetsChange={handleInsetsChange}
      style={adjustment?.style ? [style, adjustment.style] : style}
    >
      <ChildInsets insets={reported ? native.insets : ZERO_INSETS}>
        {children}
      </ChildInsets>
    </NativeView>
  );
}

/** The web: measured from JS. */
function MeasuredSafeAreaView({
  edges,
  mode = 'padding',
  avoid,
  spacing,
  granular,
  dynamic = false,
  underlying = false,
  onInsetsChange,
  accessory,
  style,
  onLayout,
  children,
  ref: forwardedRef,
  ...rest
}: ImplProps) {
  const store = useGranularSafeAreaStore();
  const modes = useEdgeModes(edges);
  const scroll = useScrollViewAxes();
  useAccessoryCleanup(store, accessory);
  const measured = useMeasuredSafeArea({
    modes,
    mode,
    avoid,
    spacing,
    granular,
    dynamic,
    underlying,
    scroll,
    style,
    onLayout,
    onInsetsChange,
    accessory,
  });
  const setRef = useMergedRef(measured.ref, forwardedRef);
  return (
    <View
      {...rest}
      ref={setRef}
      onLayout={measured.onLayout}
      style={measured.style}
    >
      <ChildInsets insets={mode === 'offset' ? ZERO_INSETS : measured.insets}>
        {children}
      </ChildInsets>
    </View>
  );
}

export function ChildInsets({
  insets,
  children,
}: {
  insets: EdgeInsets;
  children?: ReactNode;
}) {
  return (
    <SafeAreaViewInsetsContext.Provider value={insets}>
      {children}
    </SafeAreaViewInsetsContext.Provider>
  );
}

const NO_REGIONS: readonly SafeAreaRegion[] = [];

/** One ref callback that fills the library's ref and the caller's. */
function useMergedRef(
  own: { current: HostInstance | null },
  forwarded: Ref<HostInstance> | undefined
) {
  return useCallback(
    (node: HostInstance | null) => {
      own.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [own, forwarded]
  );
}
