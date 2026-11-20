import { StyleSheet, Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';
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

/**
 * Draws a provider's regions on top of everything in it, labelled with their kinds: `<GranularSafeAreaProvider
 * debug>`. It ignores touches.
 */
export function GranularSafeAreaDebugOverlay({
  store,
}: {
  store: GranularSafeAreaStore;
}) {
  const regions = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().regions
  );
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
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
  region: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  label: { fontSize: 9, fontWeight: '600', color: '#000', padding: 2 },
});
