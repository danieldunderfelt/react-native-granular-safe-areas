import { StyleSheet, Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';
import { useGranularSafeAreaStore } from './hooks';
import type { GranularSafeAreaStore } from './store';
import type { SafeAreaRegionKind } from './types';

const COLORS: Record<SafeAreaRegionKind, string> = {
  inset: 'rgba(255, 149, 0, 0.35)',
  status: 'rgba(255, 45, 85, 0.4)',
  cutout: 'rgba(175, 82, 222, 0.45)',
  controls: 'rgba(0, 122, 255, 0.4)',
  accessory: 'rgba(90, 200, 250, 0.4)',
  fold: 'rgba(52, 199, 89, 0.4)',
};

export type GranularSafeAreaDebugOverlayProps = {
  /** The store to draw. Defaults to the nearest provider's, or the window's. */
  store?: GranularSafeAreaStore;
};

/**
 * Draws the regions on top of everything around it, labelled with their kinds, and a caption with how many there are,
 * so it shows even where there's nothing to avoid. It ignores touches.
 *
 * `<GranularSafeAreaProvider debug>` draws one in the provider. Without a provider, render it last in the root view
 * of the app, which fills the window, where the regions are measured. Native sheets and modals are drawn above it;
 * render one in them too.
 */
export function GranularSafeAreaDebugOverlay({
  store: given,
}: GranularSafeAreaDebugOverlayProps) {
  const nearest = useGranularSafeAreaStore();
  const store = given ?? nearest;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { regions, metrics } = snapshot;
  return (
    <View style={styles.overlay}>
      {regions.map((region, index) => (
        <View
          key={index}
          style={[
            styles.region,
            {
              left: region.frame.x,
              top: region.frame.y,
              width: region.frame.width,
              height: region.frame.height,
              backgroundColor: COLORS[region.kind],
            },
          ]}
        >
          <Text style={styles.label} numberOfLines={1}>
            {region.kind}
          </Text>
        </View>
      ))}
      <View style={styles.caption}>
        <Text style={styles.captionText}>
          {metrics
            ? `${regions.length} region${regions.length === 1 ? '' : 's'} · ${Math.round(metrics.width)}×${Math.round(metrics.height)}`
            : 'safe areas: not measured yet'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    pointerEvents: 'none',
    zIndex: 100000,
    elevation: 100000,
  },
  region: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  label: { fontSize: 9, fontWeight: '600', color: '#000', padding: 2 },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    alignItems: 'center',
  },
  captionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
