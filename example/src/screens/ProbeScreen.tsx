import { useState } from 'react';
import {
  Button,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
} from 'react-native';
import {
  getDiagnostics,
  GranularSafeAreaView,
  useGranularSafeAreaMetrics,
  useSafeAreaRegions,
} from 'react-native-granular-safe-areas';

/**
 * Phase 0 probe: shows the live regions and metrics, and collects the full native diagnostics. Run it in each
 * configuration (plain, native header items, native tabs, sheet) and each pose, and share the JSON back.
 */
export function ProbeScreen() {
  const metrics = useGranularSafeAreaMetrics();
  const regions = useSafeAreaRegions();
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const collect = async () => {
    const result = await getDiagnostics();
    const json = JSON.stringify(
      result ?? { note: `No native diagnostics on ${Platform.OS}` },
      null,
      2
    );
    // Shows up in the Metro terminal, which is the easiest way to get it off the device.
    console.log(`[granular-safe-areas probe]\n${json}`);
    setDiagnostics(json);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
    >
      <GranularSafeAreaView
        scrollable="vertical"
        edges={['left', 'right']}
        style={styles.content}
      >
        <Button title="Collect diagnostics" onPress={collect} />
        {diagnostics ? (
          <Button
            title="Share diagnostics"
            onPress={() => Share.share({ message: diagnostics })}
          />
        ) : null}
        <Text style={styles.heading}>Regions ({regions.length})</Text>
        <Text style={styles.mono} selectable>
          {regions
            .map(
              (r) =>
                `${r.kind.padEnd(9)} ${String(r.edge).padEnd(6)} ${fmt(r.frame.x)},${fmt(r.frame.y)} ${fmt(r.frame.width)}×${fmt(r.frame.height)}`
            )
            .join('\n') || 'none'}
        </Text>
        <Text style={styles.heading}>Metrics</Text>
        <Text style={styles.mono} selectable>
          {JSON.stringify(metrics, null, 1)}
        </Text>
        {diagnostics ? (
          <>
            <Text style={styles.heading}>Diagnostics</Text>
            <Text style={styles.mono} selectable>
              {diagnostics}
            </Text>
          </>
        ) : null}
      </GranularSafeAreaView>
    </ScrollView>
  );
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 8 },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 12 },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 11,
  },
});
