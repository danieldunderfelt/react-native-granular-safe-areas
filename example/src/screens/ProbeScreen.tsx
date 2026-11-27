import { useState } from 'react';
import {
  Button,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  checkDiagnostics,
  getDiagnostics,
  SafeAreaView,
  useSafeAreaDevice,
  useSafeAreaRegions,
  type DiagnosticsCheckResult,
} from 'react-native-granular-safe-areas';
import { useGranularSafeAreaMetrics } from 'react-native-granular-safe-areas/testing';

/**
 * Phase 0 probe: shows the live regions and metrics, collects the full native diagnostics, and checks that granular
 * safe areas and system bar controls are being reported properly.
 */
export function ProbeScreen() {
  const device = useSafeAreaDevice();
  const metrics = useGranularSafeAreaMetrics();
  const regions = useSafeAreaRegions();
  const [check, setCheck] = useState<DiagnosticsCheckResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const collect = async () => {
    const result = await getDiagnostics();
    const report = checkDiagnostics(result, { metrics, regions });
    setCheck(report);
    const json = JSON.stringify(
      {
        check: report,
        providerMetrics: metrics,
        regions,
        native: result ?? { note: `No native diagnostics on ${Platform.OS}` },
      },
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
      <SafeAreaView edges={['left', 'right']} style={styles.content}>
        <Button title="Collect diagnostics" onPress={collect} />
        {diagnostics ? (
          <Button
            title="Share diagnostics"
            onPress={() => Share.share({ message: diagnostics })}
          />
        ) : null}
        {check ? (
          <View
            style={[
              styles.checkBox,
              check.ok ? styles.checkPass : styles.checkFail,
            ]}
          >
            <Text style={styles.checkTitle}>
              {check.ok ? 'Check passed' : 'Check failed'} ({check.platform})
            </Text>
            {check.checks.map((item) => (
              <Text key={item.id} style={styles.checkRow}>
                {item.status === 'pass'
                  ? '✓'
                  : item.status === 'warn'
                    ? '!'
                    : '✕'}{' '}
                {item.id}: {item.message}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.heading}>Device</Text>
        <Text style={styles.mono} selectable>
          {`${device.type} (${device.posture}) · ${device.platform} · granular=${device.granularSupported}`}
          {device.model ? `\n${device.model}` : ''}
          {device.systemVersion ? ` · OS ${device.systemVersion}` : ''}
        </Text>
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
      </SafeAreaView>
    </ScrollView>
  );
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 8 },
  checkBox: {
    padding: 12,
    borderRadius: 10,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checkPass: {
    backgroundColor: '#eefaf0',
    borderColor: '#34c759',
  },
  checkFail: {
    backgroundColor: '#fff0f0',
    borderColor: '#ff3b30',
  },
  checkTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  checkRow: { fontSize: 12, lineHeight: 17 },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 12 },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 11,
  },
});
