import {
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  computeElementInsets,
  DEFAULT_AVOID,
  EDGES,
  insetsEqual,
  placementToRect,
  sweepElement,
  sweepRegions,
  ZERO_INSETS,
  type GranularPlacement,
} from './geometry';
import { GranularSafeAreaContext } from './GranularSafeAreaProvider';
import type { GranularSafeAreaStore } from './store';
import type {
  Edge,
  EdgeInsets,
  GranularInsetsOptions,
  GranularSafeAreaMetrics,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';

export function useGranularSafeAreaStore(): GranularSafeAreaStore {
  const store = useContext(GranularSafeAreaContext);
  if (!store) {
    throw new Error(
      'No GranularSafeAreaProvider found. Render <GranularSafeAreaProvider> near the root of your app, inside <SafeAreaProvider>.'
    );
  }
  return store;
}

/** The regions the OS draws over, in the nearest provider's coordinates. Re-renders whenever they change. */
export function useSafeAreaRegions(): readonly SafeAreaRegion[] {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().regions
  );
}

/** The raw platform metrics of the nearest provider. Re-renders whenever they change. */
export function useGranularSafeAreaMetrics(): GranularSafeAreaMetrics | null {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().metrics
  );
}

const WHOLE_PROVIDER: GranularPlacement = {};

/**
 * Manual mode: the insets an element needs at a position you describe, for you to apply, like `useSafeAreaInsets()`.
 * Nothing is measured, so it costs nothing per frame. The component re-renders only when these insets change.
 *
 * Describe the position the way you would absolutely position the element in the provider (usually the screen):
 *
 * ```tsx
 * const insets = useGranularSafeAreaInsets({ top: 0, height: 56 }); // a header strip
 * <View style={{ height: 56 + insets.top, paddingTop: insets.top, paddingRight: 16 + insets.right }} />
 * ```
 *
 * With no placement it covers the whole provider, which gives the same insets as `useSafeAreaInsets()`.
 */
export function useGranularSafeAreaInsets(
  placement: GranularPlacement = WHOLE_PROVIDER,
  options: GranularInsetsOptions = {}
): EdgeInsets {
  const store = useGranularSafeAreaStore();
  const { top, right, bottom, left, width, height } = placement;
  const edgesKey = (options.edges ?? EDGES).join(',');
  const avoidKey = (options.avoid ?? DEFAULT_AVOID).join(',');
  const { spacing = 0, scrollable } = options;

  const compute = useCallback((): EdgeInsets => {
    const { metrics, regions } = store.getSnapshot();
    if (!metrics) return ZERO_INSETS;
    const rect = placementToRect(
      { top, right, bottom, left, width, height },
      metrics
    );
    return computeElementInsets(
      scrollable ? sweepElement(rect, scrollable, metrics) : rect,
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
  }, [
    store,
    top,
    right,
    bottom,
    left,
    width,
    height,
    edgesKey,
    avoidKey,
    spacing,
    scrollable,
  ]);

  const [insets, setInsets] = useState(compute);
  // Recompute when the regions or the placement change. Keep the same object while the result is the same, so the
  // component doesn't re-render and anything memoized on it doesn't re-run.
  useLayoutEffect(() => {
    const update = () =>
      setInsets((previous) => {
        const next = compute();
        return insetsEqual(previous, next) ? previous : next;
      });
    update();
    return store.subscribe(update);
  }, [store, compute]);
  return insets;
}
