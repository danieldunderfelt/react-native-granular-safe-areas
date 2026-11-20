import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from 'react';
import {
  View,
  type HostInstance,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import {
  computeElementInsets,
  DEFAULT_AVOID,
  edgeMask,
  EDGES,
  insetsEqual,
  trackedRegions,
  withoutScrollingEdges,
  ZERO_INSETS,
} from './geometry';
import { measureRect } from './GranularSafeAreaProvider';
import { useGranularSafeAreaStore } from './hooks';
import { canTrackScrollFromJS, DynamicView } from './nativeBridge';
import type { InsetsChangeEvent } from './specs/GranularSafeAreaDynamicViewNativeComponent';
import { adjustmentStyle } from './style';
import { useMeasuredSafeArea } from './useGranularSafeArea';
import type {
  Edge,
  EdgeInsets,
  GranularSafeAreaOptions,
  SafeAreaRegionKind,
} from './types';

export type GranularSafeAreaViewProps = ViewProps &
  GranularSafeAreaOptions & {
    ref?: Ref<HostInstance>;
    /**
     * Follow the view as it moves on screen, and avoid only what it overlaps where it is right now. Use it for content
     * that moves under the OS UI: a badge on a card in a scroll view moves clear of the status cluster while it
     * passes it, and goes back to the edge in the free stretch of the column.
     *
     * On iOS the view follows itself natively, on the UI thread: in the same frame as the scroll views around it
     * scroll, and after every layout change. Nothing runs in JS while it moves. `mode="offset"` is applied natively
     * too; `mode="padding"` changes layout, so JS applies it when the insets change, a frame or two later.
     *
     * Combine it with `scrollable` to ignore the regions on the scrolling edges. Set it when the view mounts: changing
     * it remounts the view.
     */
    dynamic?: boolean;
  };

/**
 * A `View` that moves its content clear of the OS UI it actually overlaps, and only there. It follows the system UI
 * as it changes: a growing Dynamic Island, bars appearing, growing or shrinking, rotation, folding. With `dynamic` it
 * also follows its own position as it scrolls or moves.
 *
 * Compared with `SafeAreaView`, an element in a free stretch of the iPhone Duo's right column keeps the full width,
 * while one next to the status cluster or a vertical system bar is pushed in by exactly the overlap. On devices
 * without granular metrics it behaves like `SafeAreaView` for the edges it overlaps.
 */
export function GranularSafeAreaView(props: GranularSafeAreaViewProps) {
  return props.dynamic && DynamicView ? (
    <TrackedSafeAreaView {...props} />
  ) : (
    <MeasuredSafeAreaView {...props} />
  );
}

/** Measured from JS when it mounts, when its layout changes and when the system UI changes. */
function MeasuredSafeAreaView({
  edges,
  avoid,
  spacing,
  mode,
  scrollable,
  dynamic = false,
  style,
  onLayout,
  ref: forwardedRef,
  ...rest
}: GranularSafeAreaViewProps) {
  // Where nothing can follow the element (Android), it stays a regular granular view.
  const { props } = useMeasuredSafeArea(
    { edges, avoid, spacing, mode, scrollable, style, onLayout },
    dynamic && canTrackScrollFromJS
  );
  const setRef = useMergedRef(props.ref, forwardedRef);
  return (
    <View
      {...rest}
      ref={setRef}
      onLayout={props.onLayout}
      style={props.style}
    />
  );
}

/** Follows itself natively. JS only hands it the regions, and applies padding when told to. */
function TrackedSafeAreaView({
  edges,
  avoid,
  spacing = 0,
  mode = 'padding',
  scrollable,
  dynamic: _dynamic,
  style,
  ref: forwardedRef,
  ...rest
}: GranularSafeAreaViewProps) {
  const NativeView = DynamicView!;
  const store = useGranularSafeAreaStore();
  const regions = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().regions
  );
  const edgesKey = (edges ?? EDGES).join(',');
  const avoidKey = (avoid ?? DEFAULT_AVOID).join(',');
  const nativeRegions = useMemo(
    () =>
      trackedRegions(regions, {
        avoid: avoidKey.split(',') as SafeAreaRegionKind[],
        spacing,
        scrollable,
      }),
    [regions, avoidKey, spacing, scrollable]
  );
  const mask = useMemo(
    () => edgeMask(edgesKey ? (edgesKey.split(',') as Edge[]) : []),
    [edgesKey]
  );

  // Padding mode only: the native side reports the insets, JS applies them.
  const [insets, setInsets] = useState<EdgeInsets>(ZERO_INSETS);
  const handleInsetsChange = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<InsetsChangeEvent>) => {
      const { top, right, bottom, left } = nativeEvent;
      const next = { top, right, bottom, left };
      setInsets((previous) => (insetsEqual(previous, next) ? previous : next));
    },
    []
  );

  // So the first frame already has its padding, measure once from JS. From then on the native side reports.
  const ref = useRef<HostInstance | null>(null);
  const setRef = useMergedRef(ref, forwardedRef);
  const padding = mode === 'padding';
  useLayoutEffect(() => {
    if (!padding) return;
    const { metrics, regions: current } = store.getSnapshot();
    const element = measureRect(ref.current);
    const provider = store.getProviderRect();
    if (!metrics || !element || !provider) return;
    const initial = computeElementInsets(
      { ...element, x: element.x - provider.x, y: element.y - provider.y },
      scrollable ? withoutScrollingEdges(current, scrollable) : current,
      {
        edges: edgesKey.split(',') as Edge[],
        avoid: avoidKey.split(',') as SafeAreaRegionKind[],
        spacing,
        bounds: metrics,
      }
    );
    setInsets((previous) =>
      insetsEqual(previous, initial) ? previous : initial
    );
    // Only on mount: afterwards the native side is the one source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padding]);

  // New elements usually mean navigation, which can change the system bars.
  useEffect(() => {
    store.requestRefresh();
  }, [store]);

  return (
    <NativeView
      {...rest}
      ref={setRef}
      regions={nativeRegions}
      edges={mask}
      mode={mode}
      onInsetsChange={padding ? handleInsetsChange : undefined}
      style={padding ? [style, adjustmentStyle(style, insets, mode)] : style}
    />
  );
}

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
