import {
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  activeEdges,
  DEFAULT_AVOID,
  edgeModes,
  getTabBarEdge,
  insetsEqual,
  placementToRect,
  safeAreaViewInsets,
  ZERO_INSETS,
  type GranularPlacement,
  type SystemControls,
} from './geometry';
import { getDefaultStore } from './defaultStore';
import { GranularSafeAreaContext } from './context';
import type { SafeAreaDeviceInfo } from './device';
import type { GranularSafeAreaStore } from './store';
import type {
  Edge,
  EdgeInsets,
  Edges,
  GranularInsetsOptions,
  GranularSafeAreaMetrics,
  SafeAreaRegion,
  SafeAreaRegionKind,
} from './types';

/**
 * The store of the nearest `GranularSafeAreaProvider`, or else the app's window's: no provider is needed, one only
 * scopes a part of the app (a mock device, a custom overlay).
 */
export function useGranularSafeAreaStore(): GranularSafeAreaStore {
  return useContext(GranularSafeAreaContext) ?? getDefaultStore();
}

/** The regions the OS draws over, in the nearest provider's coordinates. Re-renders whenever they change. */
export function useSafeAreaRegions(): readonly SafeAreaRegion[] {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().regions
  );
}

/**
 * The strip along one edge where the system puts its controls and yours may join, or `null` where there isn't one:
 * the iPhone Duo's vertical bar (closed, or open in landscape). What's in it, where it's free, the size of the system's
 * items and the line they're centered on, for laying out controls of your own there. Re-renders when it changes.
 */
export function useSystemControls(): SystemControls | null {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().systemControls
  );
}

/**
 * The edge the system puts a tab bar on here, whether or not the app shows one: where UIKit actually laid out its
 * visible tab bar when present, the vertical bar's edge when UIKit uses the column for bars (the iPhone Duo closed),
 * the top of an iPad window of regular width, and the bottom everywhere else (including the Duo open in landscape and
 * portrait). For a tab bar of your own that should sit where the system's would, or to know which way is "past the
 * tab bar". Re-renders when it changes, such as when the Duo opens.
 *
 * To keep floating UI clear of whichever tab bar there is, you don't need it: a `granular` `SafeAreaView` already
 * avoids UIKit's tab bar wherever it is, and your own if it's a `SafeAreaAccessory`.
 */
export function useTabBarEdge(): Edge {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(store.subscribe, () =>
    getTabBarEdge(store.getSnapshot().metrics)
  );
}

/**
 * The current device's form factor (`'phone'`, `'tablet'`, `'foldable'`, `'desktop'`, `'web'`, or `'unknown'`),
 * posture (`'standard'`, `'folded'`, `'unfolded'`, `'half-opened'`, `'windowed'`), native hardware/OS identifiers, and
 * whether granular safe areas are currently supported and active. Re-renders only when any of these fields change.
 */
export function useSafeAreaDevice(): SafeAreaDeviceInfo {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().device
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

export type SafeAreaInsetsForOptions = GranularInsetsOptions & {
  /** Edges the element may be pushed in from. Defaults to all four. */
  edges?: Edges;
  /**
   * The scroll axis, when the element is in a scroll view: nothing is measured that could tell. The edges it scrolls
   * towards are then left to the scroll view's content inset, and it's treated as covering the whole axis.
   */
  scrollable?: 'vertical' | 'horizontal';
};

/**
 * The insets an element needs at a position you describe, for you to apply, like `useSafeAreaInsets()`. For layouts
 * `SafeAreaView` can't express, such as a header whose height depends on the insets. Nothing is measured, and the
 * component re-renders only when these insets change.
 *
 * Describe the position the way you would absolutely position the element on the screen (in the provider):
 *
 * ```tsx
 * const { top } = useSafeAreaInsets();
 * const header = useSafeAreaInsetsFor({ top: 0, height: top + 56 });
 * <View style={{ height: top + 56, paddingTop: header.top, paddingRight: 16 + header.right }} />
 * ```
 *
 * Like `SafeAreaView`, it avoids whole bands unless `granular` is set. With no placement it covers the whole screen,
 * which gives the same insets as `useSafeAreaInsets()`.
 */
export function useSafeAreaInsetsFor(
  placement: GranularPlacement = WHOLE_PROVIDER,
  options: SafeAreaInsetsForOptions = {}
): EdgeInsets {
  const store = useGranularSafeAreaStore();
  const { top, right, bottom, left, width, height } = placement;
  const edgesKey = activeEdges(edgeModes(options.edges)).join(',');
  const avoidKey = (options.avoid ?? DEFAULT_AVOID).join(',');
  const { spacing = 0, granular = false, scrollable } = options;

  const compute = useCallback((): EdgeInsets => {
    const { metrics, regions, bands } = store.getSnapshot();
    if (!metrics) return ZERO_INSETS;
    const rect = placementToRect(
      { top, right, bottom, left, width, height },
      metrics
    );
    return safeAreaViewInsets(rect, {
      regions,
      bands,
      granular,
      scroll: {
        vertical: scrollable === 'vertical',
        horizontal: scrollable === 'horizontal',
      },
      edges: edgesKey ? (edgesKey.split(',') as Edge[]) : [],
      avoid: avoidKey.split(',') as SafeAreaRegionKind[],
      spacing,
      bounds: metrics,
    });
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
    granular,
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
