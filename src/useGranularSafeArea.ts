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
  computeElementInsets,
  DEFAULT_AVOID,
  EDGES,
  followsOwnPadding,
  insetsEqual,
  removeOffset,
  sweepElement,
  sweepRegions,
  withoutScrollingEdges,
  ZERO_INSETS,
} from './geometry';
import { measureRect } from './GranularSafeAreaProvider';
import { useGranularSafeAreaStore } from './hooks';
import { subscribeToScroll } from './nativeBridge';
import { adjustmentStyle } from './style';
import type {
  Edge,
  EdgeInsets,
  GranularSafeAreaOptions,
  Rect,
  SafeAreaRegionKind,
} from './types';

export type UseGranularSafeAreaOptions = GranularSafeAreaOptions & {
  /** The element's own style. The returned `style` includes it, and padding is added on top of its padding. */
  style?: StyleProp<ViewStyle>;
  /** Your own layout handler, if the element needs one. It is called after the element is measured. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

export type GranularSafeAreaProps = {
  ref: RefObject<HostInstance | null>;
  onLayout: (event: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
};

export type UseGranularSafeAreaResult = {
  /** Spread onto the element: `<View {...granular.props} />`. Attach to a host view or a component that forwards it. */
  props: GranularSafeAreaProps;
  /** The insets currently applied. */
  insets: EdgeInsets;
  /** Measure again. Call it when the element moved without a layout change, e.g. after an animated transform. */
  remeasure: () => unknown;
};

/**
 * Automatic mode: measures the element the returned props are attached to and applies the insets it needs, as
 * padding or as an offset. `GranularSafeAreaView` is this hook on a `View`.
 *
 * Cost: one synchronous layout read when the element mounts, when its layout changes, and when the system UI changes.
 * Nothing runs per frame, and the element re-renders only when its insets change.
 *
 * ```tsx
 * const fab = useGranularSafeArea({ mode: 'offset', style: styles.fab });
 * <Pressable {...fab.props} onPress={scan} />
 * ```
 */
export function useGranularSafeArea(
  options: UseGranularSafeAreaOptions = {}
): UseGranularSafeAreaResult {
  return useMeasuredSafeArea(options, false);
}

/**
 * {@link useGranularSafeArea}, optionally following the element as it moves. `GranularSafeAreaView` uses it with
 * `dynamic` where there is no native tracking: on the web it measures again on every frame something scrolls, which
 * is cheap there because `getBoundingClientRect` is a plain DOM read.
 */
export function useMeasuredSafeArea(
  options: UseGranularSafeAreaOptions,
  dynamic: boolean
): UseGranularSafeAreaResult {
  const store = useGranularSafeAreaStore();
  const ref = useRef<HostInstance | null>(null);
  const [insets, setInsets] = useState<EdgeInsets>(ZERO_INSETS);

  // The insets the element currently shows, so its own adjustment can be removed before measuring.
  const applied = useRef(insets);
  useLayoutEffect(() => {
    applied.current = insets;
  });
  const lastMeasure = useRef<{
    rect: Rect;
    applied: EdgeInsets;
    version: number;
  } | null>(null);
  const warnedContentSized = useRef(false);

  // Arrays become strings so callers can pass inline literals without re-measuring on every render.
  const edgesKey = (options.edges ?? EDGES).join(',');
  const avoidKey = (options.avoid ?? DEFAULT_AVOID).join(',');
  const {
    spacing = 0,
    mode = 'padding',
    scrollable,
    style,
    onLayout,
  } = options;

  const measure = useCallback(() => {
    const { metrics, regions, version } = store.getSnapshot();
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
    lastMeasure.current = { rect: measured, applied: current, version };
    let rect = mode === 'offset' ? removeOffset(measured, current) : measured;

    // Scrolling content: a dynamic element avoids what it overlaps where it is now; any other avoids everything it
    // can scroll under, wherever it is now, even scrolled out of view.
    let avoiding = regions;
    if (scrollable && dynamic) {
      avoiding = withoutScrollingEdges(regions, scrollable);
    } else if (scrollable) {
      avoiding = sweepRegions(
        regions,
        scrollable,
        metrics.width,
        metrics.height
      );
      rect = sweepElement(rect, scrollable, metrics);
    }

    const next = computeElementInsets(rect, avoiding, {
      edges: edgesKey.split(',') as Edge[],
      avoid: avoidKey.split(',') as SafeAreaRegionKind[],
      spacing,
      bounds: metrics,
    });

    // A content-sized element grows by the padding it gets. Keep its current padding on that axis instead of
    // measuring the grown box, which would never settle. Growing is fine when the box grew away from the region (a
    // bar pinned to the bottom grows upwards): the padding still moves its content, and the result doesn't change.
    if (mode === 'padding' && previous) {
      const settled = (a: Edge, b: Edge) =>
        Math.abs(next[a] - current[a]) < 0.25 &&
        Math.abs(next[b] - current[b]) < 0.25;
      const follows = (edge: Edge) =>
        followsOwnPadding(previous, measured, current, edge);
      const horizontal =
        (follows('left') || follows('right')) && !settled('left', 'right');
      const vertical =
        (follows('top') || follows('bottom')) && !settled('top', 'bottom');
      const wanted = { ...next };
      if (horizontal) {
        next.left = current.left;
        next.right = current.right;
      }
      if (vertical) {
        next.top = current.top;
        next.bottom = current.bottom;
      }
      if ((horizontal || vertical) && __DEV__ && !warnedContentSized.current) {
        warnedContentSized.current = true;
        console.warn(
          `react-native-granular-safe-areas: an element in mode="padding" is sized by its content ${
            horizontal ? 'horizontally' : 'vertically'
          }, so padding cannot move its content. Use mode="offset" for it. Element: ${JSON.stringify(
            rect
          )}, insets before: ${JSON.stringify(previous.applied)}, now: ${JSON.stringify(current)}, wanted: ${JSON.stringify(wanted)}.`
        );
      }
    }
    setInsets((prev) => (insetsEqual(prev, next) ? prev : next));
  }, [store, edgesKey, avoidKey, spacing, mode, scrollable, dynamic]);

  // Measure before the first paint, then whenever the system UI or the provider changes.
  useLayoutEffect(() => {
    measure();
    return store.subscribe(measure);
  }, [store, measure]);

  // A dynamic element also measures again as things scroll, where the platform lets JS see that (the web).
  useEffect(() => {
    if (dynamic) return subscribeToScroll(measure);
    return undefined;
  }, [dynamic, measure]);

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

  const props = useMemo(
    () => ({
      ref,
      onLayout: handleLayout,
      style: [style, adjustmentStyle(style, insets, mode)],
    }),
    [handleLayout, style, insets, mode]
  );

  return { props, insets, remeasure: measure };
}
