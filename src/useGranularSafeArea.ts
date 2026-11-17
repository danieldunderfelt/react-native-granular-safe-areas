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
  grewByOwnPadding,
  insetsEqual,
  removeOffset,
  sweepRegions,
  ZERO_INSETS,
} from './geometry';
import { measureRect } from './GranularSafeAreaProvider';
import { useGranularSafeAreaStore } from './hooks';
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
  remeasure: () => void;
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
  const store = useGranularSafeAreaStore();
  const ref = useRef<HostInstance | null>(null);
  const [insets, setInsets] = useState<EdgeInsets>(ZERO_INSETS);

  // The insets the element currently shows, so its own adjustment can be removed before measuring.
  const applied = useRef(insets);
  useLayoutEffect(() => {
    applied.current = insets;
  });
  const lastMeasure = useRef<{ rect: Rect; applied: EdgeInsets } | null>(null);
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
    const { metrics, regions } = store.getSnapshot();
    if (!metrics) return;
    const element = measureRect(ref.current);
    const provider = store.getProviderRect();
    if (!element || !provider) return;

    const current = applied.current;
    let rect: Rect = {
      x: element.x - provider.x,
      y: element.y - provider.y,
      width: element.width,
      height: element.height,
    };
    const previous = lastMeasure.current;
    lastMeasure.current = { rect, applied: current };
    if (mode === 'offset') rect = removeOffset(rect, current);

    const next = computeElementInsets(
      rect,
      scrollable
        ? sweepRegions(regions, scrollable, metrics.width, metrics.height)
        : regions,
      {
        edges: edgesKey.split(',') as Edge[],
        avoid: avoidKey.split(',') as SafeAreaRegionKind[],
        spacing,
        bounds: metrics,
      }
    );

    // A content-sized element grows by the padding it gets. Keep its current padding on that axis instead of
    // measuring the grown box, which would never settle.
    if (mode === 'padding' && previous) {
      const horizontal = grewByOwnPadding(
        previous,
        rect,
        current,
        'horizontal'
      );
      const vertical = grewByOwnPadding(previous, rect, current, 'vertical');
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
          'react-native-granular-safe-areas: an element in mode="padding" is sized by its content, so padding cannot move its content. Use mode="offset" for it.'
        );
      }
    }
    setInsets((prev) => (insetsEqual(prev, next) ? prev : next));
  }, [store, edgesKey, avoidKey, spacing, mode, scrollable]);

  // Measure before the first paint, then whenever the system UI or the provider changes.
  useLayoutEffect(() => {
    measure();
    return store.subscribe(measure);
  }, [store, measure]);

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
