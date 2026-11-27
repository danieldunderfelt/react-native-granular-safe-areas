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
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  StyleSheet,
  View,
  type HostInstance,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
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
import {
  mergeDefaults,
  resolveSafeAreaProps,
  type SafeAreaDefaultsOptions,
} from './resolveProps';
import { layoutAdjustment, offsetStyle } from './style';
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
     * Keep the content at least this far from what it avoids, wherever the padding lives. On each edge the view gets
     * the larger of its own padding (or margin) and the overlap plus `gap`, so the content ends up `gap` from the OS
     * UI whether the view or its parent owns the padding, and a view clear of everything keeps its own padding.
     *
     * It's `spacing` with every additive edge made `'maximum'`. Prefer it to `spacing` for views with padding of their
     * own. Defaults to none.
     */
    gap?: number;
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
  return <SafeAreaViewImpl {...useResolvedProps(props)} />;
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
  return (
    <SafeAreaViewImpl {...useResolvedProps(props)} accessory={accessory} />
  );
}

const SafeAreaDefaultsContext = createContext<SafeAreaDefaultsOptions>({});
SafeAreaDefaultsContext.displayName = 'SafeAreaDefaultsContext';

/**
 * Defaults for every `SafeAreaView`, `SafeAreaAccessory`, `AnimatedSafeAreaView` and `useSafeAreaStyle` inside it. A
 * view's own props win; nested defaults add to the ones around them. It only sets props: it measures nothing and isn't
 * a provider.
 *
 * ```tsx
 * // Adopting in an app that already handles the top and bottom with useSafeAreaInsets(): only the side columns.
 * <SafeAreaDefaults edges={['left', 'right']} granular>
 *   <App />
 * </SafeAreaDefaults>
 * ```
 */
export function SafeAreaDefaults({
  children,
  ...defaults
}: SafeAreaDefaultsOptions & { children?: ReactNode }) {
  const parent = useContext(SafeAreaDefaultsContext);
  const key = JSON.stringify(defaults);
  const value = useMemo(
    () => mergeDefaults(parent, defaults),
    // `key` stands for `defaults`, which is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent, key]
  );
  return (
    <SafeAreaDefaultsContext.Provider value={value}>
      {children}
    </SafeAreaDefaultsContext.Provider>
  );
}

/**
 * The props a view goes by: its own, then the nearest `SafeAreaDefaults`, with `gap` turned into what it means
 * (`spacing`, and `'maximum'` for every additive edge).
 */
export function useResolvedProps<P extends SafeAreaDefaultsOptions>(
  props: P
): Omit<P, 'gap'> {
  return resolveSafeAreaProps(props, useContext(SafeAreaDefaultsContext));
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
 *
 * When the content also has padding of its own, `useSafeAreaViewStyle(styles.content)` combines them for you,
 * respecting the enclosing view's `gap`, `maximum` and `additive` edges, shorthands (`paddingHorizontal`) and RTL.
 */
export function useSafeAreaViewInsets(): EdgeInsets {
  return useContext(SafeAreaViewInsetsContext).insets;
}

export type UseSafeAreaViewStyleOptions = {
  /**
   * Edges to apply from the enclosing `SafeAreaView`. Defaults to the enclosing view's own edge modes (including
   * `'maximum'` from its `gap`). Pass `edges` to pick a subset or override `'additive'` / `'maximum'`.
   */
  edges?: Edges;
  /** Whether to apply the insets as `'padding'` (default) or `'margin'`. */
  mode?: 'padding' | 'margin';
};

/**
 * Combines the nearest `SafeAreaView`'s insets with a component's own `style`, for content that applies the insets
 * itself — such as a `ScrollView` or `FlatList`'s `contentContainerStyle`:
 *
 * ```tsx
 * <SafeAreaView mode="none" edges={['right', 'bottom']} gap={16} style={{ flex: 1 }}>
 *   <TripList />
 * </SafeAreaView>
 *
 * function TripList() {
 *   const safeArea = useSafeAreaViewStyle(styles.content);
 *   return <FlatList contentContainerStyle={[styles.content, safeArea]} ... />;
 * }
 * ```
 *
 * Respects the enclosing view's `gap`, `'maximum'` / `'additive'` edge modes, shorthands (`paddingHorizontal`,
 * `paddingStart`, `paddingEnd`) and right-to-left layouts. Returns `null` when nothing changes.
 */
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

export type { SafeAreaDefaultsOptions };

export type ImplProps = SafeAreaViewProps & {
  accessory?: AccessoryOptions;
  /**
   * `useSafeAreaStyle`'s probe: what to take out of its measurement, as margins, because the insets moved the view it
   * fills (`margin`, or `offset` where it's measured as drawn).
   */
  correction?: EdgeInsets;
};

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
  | 'avoidScrollingEdges'
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
  avoidScrollingEdges = false,
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
        avoidScrollingEdges,
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
      edges: edgeMask(activeEdges(modes), avoidScrollingEdges),
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
  avoidScrollingEdges,
  underlying,
  onInsetsChange,
  accessory,
  correction,
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
    avoidScrollingEdges,
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
      margins={
        correction ??
        (mode === 'margin' ? adjustment?.added : undefined) ??
        ZERO_INSETS
      }
      onInsetsChange={handleInsetsChange}
      style={adjustment?.style ? [style, adjustment.style] : style}
    >
      <ChildInsets
        insets={reported ? native.insets : ZERO_INSETS}
        modes={native.modes}
      >
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
  avoidScrollingEdges = false,
  underlying = false,
  onInsetsChange,
  accessory,
  correction,
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
    avoidScrollingEdges,
    underlying,
    scroll,
    style,
    onLayout,
    onInsetsChange,
    accessory,
    correction,
  });
  const setRef = useMergedRef(measured.ref, forwardedRef);
  return (
    <View
      {...rest}
      ref={setRef}
      onLayout={measured.onLayout}
      style={measured.style}
    >
      <ChildInsets
        insets={mode === 'offset' ? ZERO_INSETS : measured.insets}
        modes={modes}
      >
        {children}
      </ChildInsets>
    </View>
  );
}

export function ChildInsets({
  insets,
  modes = DEFAULT_INSETS_CONTEXT.modes,
  children,
}: {
  insets: EdgeInsets;
  modes?: Readonly<Record<Edge, EdgeMode>>;
  children?: ReactNode;
}) {
  const value = useMemo(() => ({ insets, modes }), [insets, modes]);
  return (
    <SafeAreaViewInsetsContext.Provider value={value}>
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

export type UseSafeAreaStyleOptions = Pick<
  SafeAreaViewProps,
  | 'edges'
  | 'mode'
  | 'granular'
  | 'dynamic'
  | 'avoidScrollingEdges'
  | 'avoid'
  | 'spacing'
  | 'gap'
  | 'underlying'
  | 'onInsetsChange'
> & {
  /**
   * The component's own style, so `additive` and `maximum` edges can build on its padding or margin, and `offset` on
   * its transform. Leave out what changes with state (`pressed`) unless it changes those.
   */
  style?: StyleProp<ViewStyle>;
};

export type SafeAreaStyle = {
  /** Put this after the component's own style: the padding, margin or transform that applies the insets. */
  style: ViewStyle | null;
  /** The insets, once measured. Zero until then, and wherever nothing needs avoiding. */
  insets: EdgeInsets;
  /**
   * Render this as a child of the component's root. It's an invisible view that fills the root (absolutely
   * positioned, so it takes no part in layout) and measures it, the way a `SafeAreaView` measures itself.
   */
  probe: ReactElement;
};

/**
 * `SafeAreaView` for a component whose root you don't control, such as a `Pressable`, where a wrapper view would break
 * the layout (`flex: 1`, stretching, alignment). Render `probe` inside the root and add `style` to it:
 *
 * ```tsx
 * function Button({ style, children, ...props }: ButtonProps) {
 *   const safeArea = useSafeAreaStyle({ edges: ['left', 'right'], granular: true, style: styles.button });
 *   return (
 *     <Pressable {...props} style={(state) => [styles.button, resolve(style, state), safeArea.style]}>
 *       {safeArea.probe}
 *       {children}
 *     </Pressable>
 *   );
 * }
 * ```
 *
 * It takes `SafeAreaView`'s options and measures natively the same way: scroll views, clipping, what's drawn on top,
 * transitions. The root's border isn't part of what's measured.
 */
export function useSafeAreaStyle(
  options: UseSafeAreaStyleOptions = {}
): SafeAreaStyle {
  const {
    mode = 'padding',
    style,
    onInsetsChange,
    ...measure
  } = useResolvedProps(options);
  const modes = useEdgeModes(measure.edges);
  const [insets, setInsets] = useState<EdgeInsets>(ZERO_INSETS);
  const onInsetsChangeRef = useRef(onInsetsChange);
  useLayoutEffect(() => {
    onInsetsChangeRef.current = onInsetsChange;
  });
  const handleInsets = useCallback((next: EdgeInsets) => {
    setInsets((previous) => (insetsEqual(previous, next) ? previous : next));
    onInsetsChangeRef.current?.(next);
  }, []);

  const adjustment =
    mode === 'padding' || mode === 'margin'
      ? layoutAdjustment(style, insets, mode, modes)
      : null;
  const offset = mode === 'offset' ? offsetStyle(style, insets) : null;
  // The probe sits in the root, so whatever moves the root moves it. Margin always does; offset only where the probe
  // is measured as drawn (a dynamic view, or measured from JS), since a static native view leaves transforms out.
  const dx = insets.left - insets.right;
  const dy = insets.top - insets.bottom;
  const correction =
    mode === 'margin'
      ? adjustment!.added
      : mode === 'offset' && (measure.dynamic || !NativeSafeAreaView)
        ? { top: dy, right: -dx, bottom: -dy, left: dx }
        : ZERO_INSETS;
  const correctionKey = EDGES.map((edge) => correction[edge]).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableCorrection = useMemo(() => correction, [correctionKey]);

  const probe = (
    <SafeAreaViewImpl
      {...measure}
      edges={modes}
      mode="none"
      correction={stableCorrection}
      onInsetsChange={handleInsets}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.probe}
    />
  );
  return {
    style: adjustment?.style ?? offset ?? null,
    insets,
    probe,
  };
}

const styles = StyleSheet.create({
  probe: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
