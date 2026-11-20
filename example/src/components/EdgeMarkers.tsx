import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-granular-safe-areas';
import { useGranularSafeAreaMetrics } from 'react-native-granular-safe-areas/testing';
import { useAvoid } from '../settings';

const SPACING = 40;

/**
 * A marker every 40 pt down the right edge, each a granular `SafeAreaView` in offset mode. A marker moves left only
 * while something is beside it, so as the system UI changes (a Live Activity, bars appearing or resizing, rotating, folding) you can
 * watch exactly which ones move.
 */
export function EdgeMarkers() {
  const metrics = useGranularSafeAreaMetrics();
  const avoid = useAvoid();
  const count = Math.floor((metrics?.height ?? 0) / SPACING);
  return (
    <View style={styles.overlay}>
      {Array.from({ length: count }, (_, row) => (
        <SafeAreaView
          key={row}
          granular
          mode="offset"
          edges={['right']}
          spacing={4}
          avoid={avoid}
          style={[styles.marker, { top: row * SPACING + 6 }]}
        >
          <Text style={styles.markerText}>◀</Text>
        </SafeAreaView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, pointerEvents: 'box-none' },
  marker: {
    position: 'absolute',
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff2d55',
  },
  markerText: { color: '#fff', fontSize: 12 },
});
