import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  fixtures,
  GranularSafeAreaView,
  type FixtureName,
} from 'react-native-granular-safe-areas';
import type { RootStackParamList } from '../navigation';
import { useAvoid, useSettings, type Avoidance } from '../settings';

const DEMOS: {
  route: Exclude<keyof RootStackParamList, 'TripDetails'>;
  title: string;
  detail: string;
  ios?: boolean;
}[] = [
  {
    route: 'Trip',
    title: 'Trip screen',
    detail: 'Custom header, cards, floating buttons',
  },
  {
    route: 'Markers',
    title: 'Edge markers',
    detail: 'A marker every 40 pt: watch them follow the system UI',
  },
  {
    route: 'Tabs',
    title: 'Trip screen in native tabs',
    detail: 'UITabBarController: a vertical tab bar on the Duo',
    ios: true,
  },
  {
    route: 'HeaderItems',
    title: 'Native header items',
    detail: 'Add and remove items: the vertical bar grows and shrinks',
    ios: true,
  },
  {
    route: 'Probe',
    title: 'Probe',
    detail: 'Live regions, metrics and native diagnostics',
  },
  {
    route: 'Sheet',
    title: 'Probe in a sheet',
    detail: 'Form sheet presentation',
  },
];

const AVOIDANCE: Avoidance[] = ['granular', 'bands', 'off'];

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    avoidance,
    setAvoidance,
    overlay,
    setOverlay,
    fixture,
    setFixture,
    liveActivity,
    setLiveActivity,
  } = useSettings();
  const avoid = useAvoid();

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
    >
      <GranularSafeAreaView
        scrollable="vertical"
        edges={['left', 'right']}
        avoid={avoid}
        style={styles.content}
      >
        <Text style={styles.section}>Demos</Text>
        {DEMOS.filter((demo) => !demo.ios || Platform.OS === 'ios').map(
          (demo) => (
            <Pressable
              key={demo.route}
              style={styles.row}
              onPress={() => navigation.navigate(demo.route)}
            >
              <Text style={styles.rowTitle}>{demo.title}</Text>
              <Text style={styles.rowDetail}>{demo.detail}</Text>
            </Pressable>
          )
        )}

        <Text style={styles.section}>Avoidance</Text>
        <Segmented
          options={AVOIDANCE}
          value={avoidance}
          onChange={setAvoidance}
        />

        <View style={styles.switchRow}>
          <Text style={styles.rowTitle}>Show regions</Text>
          <Switch value={overlay} onValueChange={setOverlay} />
        </View>

        {Platform.OS === 'web' ? (
          <>
            <Text style={styles.section}>Simulated device</Text>
            <Segmented<FixtureName | 'none'>
              options={['none', ...(Object.keys(fixtures) as FixtureName[])]}
              value={fixture ?? 'none'}
              onChange={(value) => setFixture(value === 'none' ? null : value)}
              vertical
            />
            <View style={styles.switchRow}>
              <Text style={styles.rowTitle}>Simulate a Live Activity</Text>
              <Switch value={liveActivity} onValueChange={setLiveActivity} />
            </View>
          </>
        ) : null}
      </GranularSafeAreaView>
    </ScrollView>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  vertical,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  vertical?: boolean;
}) {
  return (
    <View style={[styles.segmented, vertical && styles.segmentedVertical]}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onChange(option)}
          style={[styles.segment, option === value && styles.segmentActive]}
        >
          <Text
            style={[
              styles.segmentText,
              option === value && styles.segmentTextActive,
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 8 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6c6c70',
    textTransform: 'uppercase',
    marginTop: 12,
  },
  row: { padding: 14, borderRadius: 12, backgroundColor: '#fff', gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  rowDetail: { fontSize: 13, color: '#6c6c70' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#e3e3e8',
  },
  segmentedVertical: { flexDirection: 'column' },
  segment: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 7,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: '#3a3a3c', fontSize: 14 },
  segmentTextActive: { fontWeight: '700', color: '#000' },
});
