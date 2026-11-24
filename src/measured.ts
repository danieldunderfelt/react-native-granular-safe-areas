import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {
  HostInstance,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  activeEdges,
  DEFAULT_AVOID,
  followsOwnPadding,
  insetsEqual,
  NO_SCROLL,
  removeOffset,
  safeAreaViewInsets,
  withoutMargins,
  ZERO_INSETS,
} from './geometry';
import { measureRect } from './GranularSafeAreaProvider';
import { useGranularSafeAreaStore } from './hooks';
import { accessoryRegion, type AccessoryOptions } from './accessory';
import { areRelated, isDrawnAbove } from './drawOrder';
import {
  canTrackScrollFromJS,
  scrollAxesOf,
  subscribeToScroll,
} from './nativeBridge';
import { layoutAdjustment, offsetStyle } from './style';
import type {
  Edge,
  EdgeInsets,
  EdgeMode,
  GranularInsetsOptions,
  GranularSafeAreaMode,
  Rect,
  SafeAreaRegionKind,
  ScrollAxes,
} from './types';

export type MeasuredSafeAreaOptions = GranularInsetsOptions & {
  underlying?: boolean;
  /** A `SafeAreaAccessory`: it reports where it's drawn, for the region it takes. */
  accessory?: AccessoryOptions;
  /** Memoized: a new object measures again. */
  modes: Readonly<Record<Edge, EdgeMode>>;
  mode: GranularSafeAreaMode;
  dynamic: boolean;
  /** From `ScrollView.Context`, where the platform has it. */
  scroll: ScrollAxes | null;
  style: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  onInsetsChange?: (insets: EdgeInsets) => void;
  /** `useSafeAreaStyle`'s probe: how far the insets moved the view it fills, taken out of what it measures. */
  correction?: EdgeInsets;
};

export type MeasuredSafeArea = {
  ref: RefObject<HostInstance | null>;
  onLayout: (event: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
  insets: EdgeInsets;
};

/**
 * `SafeAreaView` where there's no native view (the web): the element measures itself with
 * `getBoundingClientRect` when it mounts, when its layout changes and when the system UI changes. A dynamic one also
 * measures again on every frame something scrolls, where JS can see that (the web, where it's a plain DOM read).
 * Elsewhere a dynamic element behaves like a granular one.
 */
export function useMeasuredSafeArea({
  modes,
  mode,
  avoid,
  spacing = 0,
  granular = false,
  dynamic,
  underlying = false,
  scroll,
  style,
  onLayout,
  onInsetsChange,
  accessory,
  correction,
}: MeasuredSafeAreaOptions): MeasuredSafeArea {
  const store = useGranularSafeAreaStore();
  const ref = useRef<HostInstance | null>(null);
  const [insets, setInsets] = useState<EdgeInsets>(ZERO_INSETS);
  const tracking = dynamic && canTrackScrollFromJS;

  const margins =
    mode === 'margin'
      ? layoutAdjustment(style, insets, 'margin', modes).added
      : ZERO_INSETS;
  // What the element shows right now, so its own adjustment can be taken out before measuring.
  const applied = useRef({ insets, margins, correction });
  useLayoutEffect(() => {
    applied.current = { insets, margins, correction };
  });
  const lastMeasure = useRef<{
    rect: Rect;
    applied: EdgeInsets;
    version: number;
  } | null>(null);
  const reported = useRef<EdgeInsets | null>(null);
  const onInsetsChangeRef = useRef(onInsetsChange);
  useLayoutEffect(() => {
    onInsetsChangeRef.current = onInsetsChange;
  });
  const warnedContentSized = useRef(false);

  // A string, so callers can pass an inline list without measuring again on every render.
  const avoidKey = (avoid ?? DEFAULT_AVOID).join(',');

  const measure = useCallback(() => {
    const { metrics, regions, bands, version } = store.getSnapshot();
    if (!metrics) return;
    const element = measureRect(ref.current);
    const provider = store.getProviderRect();
    if (!element || !provider) return;

    const current = applied.current;
    const measured: Rect = {
      x: element.x - provider.x,
      y: element.y - provider.y,
      width: element.width,
      height: element.height,
    };
    // Only compare with a measurement against the same regions and provider layout. Across a change (unfolding,
    // rotating) the element moves and resizes for reasons that have nothing to do with its own padding.
    const previous =
      lastMeasure.current?.version === version ? lastMeasure.current : null;
    lastMeasure.current = { rect: measured, applied: current.insets, version };
    let rect = measured;
    if (mode === 'offset') rect = removeOffset(rect, current.insets);
    if (mode === 'margin') rect = withoutMargins(rect, current.margins);
    if (current.correction) rect = withoutMargins(rect, current.correction);

    const axes =
      scrollAxesOf(ref.current, store.getProviderNode()) ?? scroll ?? NO_SCROLL;
    const node = ref.current;
    // App UI covers the element only when it's drawn on top of it. JS can tell that for accessories, from the order of
    // the tree; anything else is assumed to.
    const covers = (owner: number) => {
      const other = store.getAccessoryNode(owner);
      if (!other || !node) return true;
      return underlying ? !areRelated(other, node) : isDrawnAbove(other, node);
    };
    const next = safeAreaViewInsets(rect, {
      regions,
      bands,
      granular: granular || dynamic,
      dynamic: tracking,
      scroll: axes,
      covers,
      edges: activeEdges(modes),
      avoid: avoidKey.split(',') as SafeAreaRegionKind[],
      spacing,
      bounds: metrics,
    });

    // A content-sized element grows by the padding it gets. Keep its current padding on that axis instead of
    // measuring the grown box, which would never settle. Growing is fine when the box grew away from the region (a
    // bar pinned to the bottom grows upwards): the padding still moves its content, and the result doesn't change.
    if (mode === 'padding' && previous) {
      const before = current.insets;
      const settled = (a: Edge, b: Edge) =>
        Math.abs(next[a] - before[a]) < 0.25 &&
        Math.abs(next[b] - before[b]) < 0.25;
      const follows = (edge: Edge) =>
        followsOwnPadding(previous, measured, before, edge);
      const horizontal =
        (follows('left') || follows('right')) && !settled('left', 'right');
      const vertical =
        (follows('top') || follows('bottom')) && !settled('top', 'bottom');
      if (horizontal) {
        next.left = before.left;
        next.right = before.right;
      }
      if (vertical) {
        next.top = before.top;
        next.bottom = before.bottom;
      }
      if ((horizontal || vertical) && __DEV__ && !warnedContentSized.current) {
        warnedContentSized.current = true;
        console.warn(
          `react-native-granular-safe-areas: a SafeAreaView in mode="padding" is sized by its content ${
            horizontal ? 'horizontally' : 'vertically'
          }, so padding can't move its content. Use mode="offset" for it. Element: ${JSON.stringify(measured)}.`
        );
      }
    }

    if (!reported.current || !insetsEqual(reported.current, next)) {
      reported.current = next;
      onInsetsChangeRef.current?.(next);
    }
    setInsets((prev) => (insetsEqual(prev, next) ? prev : next));

    if (accessory) {
      // Where it's drawn, with its own offset: that's what covers the content beneath it.
      store.setAccessoryNode(accessory.owner, node);
      store.setAccessory(
        accessory.owner,
        accessoryRegion(store, accessory, measured)
      );
    }
  }, [
    store,
    modes,
    avoidKey,
    spacing,
    granular,
    dynamic,
    tracking,
    mode,
    scroll,
    underlying,
    accessory,
  ]);

  // Measure before the first paint, then whenever the system UI or the provider changes.
  useLayoutEffect(() => {
    measure();
    return store.subscribe(measure);
  }, [store, measure]);

  // A dynamic element also measures again as things scroll, where JS can see that.
  useEffect(() => {
    if (tracking) return subscribeToScroll(measure);
    return undefined;
  }, [tracking, measure]);

  // New elements usually mean navigation, which can change the system bars.
  useEffect(() => {
    store.requestRefresh();
  }, [store]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      measure();
      onLayout?.(event);
    },
    [measure, onLayout]
  );

  const adjusted = useMemo(() => {
    switch (mode) {
      case 'padding':
      case 'margin':
        return layoutAdjustment(style, insets, mode, modes).style;
      case 'offset':
        return offsetStyle(style, insets);
      case 'none':
        return null;
    }
  }, [style, insets, mode, modes]);

  return {
    ref,
    onLayout: handleLayout,
    style: adjusted ? [style, adjusted] : style,
    insets,
  };
}
