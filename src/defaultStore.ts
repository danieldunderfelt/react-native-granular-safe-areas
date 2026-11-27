import { Platform } from 'react-native';
import { detectMetricsFallback, warnGranularUnavailable } from './fallback';
import { buildRegions } from './geometry';
import { parseMetrics } from './metrics';
import {
  getInitialWindowMetricsJSON,
  isNativeModuleAvailable,
  observeWindowMetrics,
  refreshWindowMetrics,
} from './nativeBridge';
import { registerStore } from './refresh';
import { GranularSafeAreaStore } from './store';
import type { GranularSafeAreaMetrics, Rect } from './types';

let defaultStore: GranularSafeAreaStore | null = null;

/**
 * The store for views outside any `GranularSafeAreaProvider`: the app's window, as a provider covering the whole
 * window would see it. It starts with the window's metrics as they are when it's created, so the first frame is
 * already right, and follows them from then on.
 */
export function getDefaultStore(): GranularSafeAreaStore {
  if (defaultStore) return defaultStore;
  let window: Rect | null = null;
  const store = new GranularSafeAreaStore(() => window, refreshWindowMetrics);
  const nativeMissing =
    !isNativeModuleAvailable &&
    (Platform.OS === 'ios' || Platform.OS === 'android');
  if (nativeMissing) {
    warnGranularUnavailable(
      'native-unavailable',
      `Native GranularSafeAreas module is unavailable on ${Platform.OS} (not linked or unsupported runtime).`
    );
  }
  const publish = (metrics: GranularSafeAreaMetrics) => {
    window = { x: 0, y: 0, width: metrics.width, height: metrics.height };
    if (!nativeMissing) {
      const fallback = detectMetricsFallback(metrics);
      if (fallback) warnGranularUnavailable(fallback.reason, fallback.message);
    }
    store.publish(
      buildRegions(metrics),
      metrics,
      buildRegions(metrics, { granular: false })
    );
  };
  const initial = parseMetrics(getInitialWindowMetricsJSON());
  if (initial) publish(initial);
  observeWindowMetrics(publish);
  registerStore(store);
  defaultStore = store;
  return store;
}
