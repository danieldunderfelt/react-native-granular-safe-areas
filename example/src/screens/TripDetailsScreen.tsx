import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-granular-safe-areas';
import { useSystemHeaderItems } from 'react-native-granular-safe-areas/native-stack';
import { LightStatusBar } from '../components/LightStatusBar';
import type { RootStackParamList } from '../navigation';
import { useAvoid } from '../settings';
import { TRIPS } from '../trips';

/**
 * A full-bleed detail screen without a navigation bar: a hero picture with floating buttons over it. On the iPhone Duo
 * the system draws the back and share buttons in the vertical bar instead, as Liquid Glass, through a transparent,
 * empty native header (`useSystemHeaderItems`). Everywhere else the floating buttons show.
 */
export function TripDetailsScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TripDetails'>>();
  const trip = TRIPS.find((t) => t.code === params.code) ?? TRIPS[0]!;
  const avoid = useAvoid();
  const { top } = useSafeAreaInsets();
  // On the Duo the top inset is 0, but the display's corners are round: keep the buttons clear of them.
  const buttonTop = Math.max(top + 8, 24);
  const share = () => Alert.alert(`Share ${trip.route}`);
  const { shown } = useSystemHeaderItems({
    headerRightItems: [
      {
        type: 'button',
        label: 'Share',
        icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
        onPress: share,
      },
    ],
  });

  return (
    <View style={styles.screen}>
      <LightStatusBar />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: trip.color }]}>
          <Text style={styles.heroCode}>{trip.code}</Text>
        </View>
        {/* Scrolling content: kept clear of the whole column, wherever it scrolls. */}
        <SafeAreaView
          edges={['left', 'right']}
          avoid={avoid}
          style={styles.body}
        >
          <Text style={styles.route}>{trip.route}</Text>
          <Text style={styles.detail}>{trip.detail}</Text>
          <View style={styles.facts}>
            <Fact label="Gate" value={trip.gate} />
            <Fact label="Seat" value={trip.seat} />
            <Fact label="Boarding" value="16:05" />
          </View>
          <Text style={styles.paragraph}>
            On the iPhone Duo, the floating back button in the top left moves
            into the vertical bar, right below the status cluster, where the
            system puts the back button of a native navigation bar. That's the
            device closed, or open in landscape. Open it in portrait, where
            there is no vertical bar, and the button comes back.
          </Text>
        </SafeAreaView>
      </ScrollView>

      {/* Where the system shows its own buttons, these give way. */}
      {shown ? null : (
        <>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={[styles.floating, styles.back, { top: buttonTop }]}
          >
            <Text style={styles.floatingText}>‹</Text>
          </Pressable>
          <SafeAreaView
            granular
            mode="offset"
            edges={['right']}
            spacing={8}
            avoid={avoid}
            style={[styles.floating, styles.share, { top: buttonTop }]}
          >
            <Pressable accessibilityLabel="Share" onPress={share}>
              <Text style={styles.floatingText}>⇪</Text>
            </Pressable>
          </SafeAreaView>
        </>
      )}

      <SafeAreaView
        granular
        edges={['left', 'right', 'bottom']}
        avoid={avoid}
        style={styles.dock}
      >
        <Pressable style={styles.checkIn}>
          <Text style={styles.checkInText}>Check in</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0618' },
  content: { paddingBottom: 140 },
  hero: { height: 300, alignItems: 'center', justifyContent: 'center' },
  heroCode: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 96,
    fontWeight: '800',
  },
  body: { padding: 20, gap: 8 },
  route: { color: '#fff', fontSize: 26, fontWeight: '700' },
  detail: { color: '#b8b5c8', fontSize: 16 },
  facts: { flexDirection: 'row', gap: 12, marginVertical: 12 },
  fact: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#211d33',
    gap: 2,
  },
  factLabel: { color: '#b8b5c8', fontSize: 13 },
  factValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  paragraph: { color: '#d8d5e8', fontSize: 15, lineHeight: 22 },
  floating: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  back: { left: 16 },
  share: { right: 16 },
  floatingText: { color: '#fff', fontSize: 24, lineHeight: 26 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  checkIn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#3a6ee8',
  },
  checkInText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
