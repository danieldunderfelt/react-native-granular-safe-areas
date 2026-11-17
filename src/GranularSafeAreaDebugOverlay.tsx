import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaRegions } from './hooks';
import type { SafeAreaRegionKind } from './types';

const COLORS: Record<SafeAreaRegionKind, string> = {
  inset: 'rgba(255, 149, 0, 0.35)',
  status: 'rgba(255, 45, 85, 0.4)',
  camera: 'rgba(175, 82, 222, 0.45)',
  systemBar: 'rgba(0, 122, 255, 0.4)',
  fold: 'rgba(52, 199, 89, 0.4)',
};

export type GranularSafeAreaDebugOverlayProps = {
  /** Label each region with its kind. Defaults to `true`. */
  labels?: boolean;
};

/**
 * Draws the regions of the nearest provider on top of the app. Render it as a direct child of
 * `GranularSafeAreaProvider`, after your content. It ignores touches.
 */
export function GranularSafeAreaDebugOverlay({
  labels = true,
}: GranularSafeAreaDebugOverlayProps) {
  const regions = useSafeAreaRegions();
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
          {labels ? (
            <Text style={styles.label} numberOfLines={1}>
              {region.kind}
            </Text>
          ) : null}
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
