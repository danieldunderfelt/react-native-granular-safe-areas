import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaAccessory,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaInsetsFor,
  useSafeAreaViewInsets,
  SystemBackButton,
} from 'react-native-granular-safe-areas';
import { AnimatedSafeAreaView } from 'react-native-granular-safe-areas/reanimated';
import { withSpring } from 'react-native-reanimated';
import type { RootStackParamList } from '../navigation';
import { useJsSheet } from '../overlays';
import { useAvoid } from '../settings';
import { TRIPS } from '../trips';

const HEADER_HEIGHT = 60;

function spring(to: number) {
  'worklet';
  return withSpring(to, { damping: 18, stiffness: 220 });
}

/**
 * A layout like the one in the README's screenshot: a custom header, a scrolling list of cards with a badge, and
 * floating controls. It shows each behavior: the list content keeps clear of the whole column (the default), the
 * floating controls avoid only what's beside them (`granular`), and the badges follow their cards as they scroll
 * (`dynamic`). The next flight bar at the bottom is an accessory: the list ends above it, while the overlays opened
 * from the list cover it and ignore it. The header uses manual insets, and its back button `SystemBackButton`.
 */
export function TripScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const avoid = useAvoid();
  const { top } = useSafeAreaInsets();

  // Manual: the header is a full-width strip at the top, so describe it and apply the insets by hand.
  const header = useSafeAreaInsetsFor(
    { top: 0, height: top + HEADER_HEIGHT },
    { avoid, granular: true }
  );

  return (
    <View style={styles.screen}>
      {/* Measures the screen and hands its insets to the list: whatever covers its bottom, accessories included. */}
      <SafeAreaView
        mode="none"
        edges={['bottom']}
        avoid={avoid}
        style={styles.fill}
      >
        <TripList top={top + HEADER_HEIGHT} />
      </SafeAreaView>

      {/* The background stays under the status cluster; the content moves in next to it. */}
      <View
        style={[
          styles.header,
          {
            height: top + HEADER_HEIGHT,
            paddingTop: header.top,
            paddingLeft: 16 + header.left,
            paddingRight: 16 + header.right,
          },
        ]}
      >
        {navigation.canGoBack() ? (
          // On the iPhone Duo this button moves into the vertical bar, below the status cluster.
          <SystemBackButton onPress={() => navigation.goBack()}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.back}>‹</Text>
            </Pressable>
          </SystemBackButton>
        ) : null}
        <Text style={styles.headerTitle} numberOfLines={1}>
          Please sign in again
        </Text>
        <Pressable style={styles.signIn}>
          <Text style={styles.signInText}>Sign in</Text>
        </Pressable>
      </View>

      {/* Moved clear of whatever is beside it, and only then. */}
      <SafeAreaView
        granular
        mode="offset"
        edges={['right', 'bottom']}
        spacing={8}
        avoid={avoid}
        style={styles.feedbackPosition}
      >
        <Pressable style={styles.feedback}>
          <Text style={styles.feedbackText}>Feedback</Text>
        </Pressable>
      </SafeAreaView>

      {/*
        An accessory, like a boarding pass button: padded clear of the home indicator and of a tab bar beside it, and
        avoided by the content beneath it. Sheets and modals cover it, so they ignore it.
      */}
      <SafeAreaAccessory
        granular
        edges={['left', 'right', 'bottom']}
        avoid={avoid}
        style={styles.dock}
      >
        <View style={styles.nextFlight}>
          <Text style={styles.nextCode}>HEL–LIS</Text>
          <Text style={styles.nextText} numberOfLines={1}>
            Gate opens in 26 h 20 min
          </Text>
          <Pressable style={styles.qr}>
            <Text style={styles.qrText}>▦</Text>
          </Pressable>
        </View>
      </SafeAreaAccessory>
    </View>
  );
}

/** The cards, padded at the bottom by the insets of the `SafeAreaView` around them. */
function TripList({ top }: { top: number }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const avoid = useAvoid();
  const jsSheet = useJsSheet();
  const { bottom } = useSafeAreaViewInsets();
  return (
    <ScrollView
      contentContainerStyle={[
        styles.list,
        { paddingTop: top + 24, paddingBottom: bottom + 24 },
      ]}
    >
      {/* The overlays cover the next flight bar and the tab bar: their content ignores both. */}
      <SafeAreaView
        edges={['left', 'right']}
        avoid={avoid}
        style={styles.chips}
      >
        <Chip title="JS sheet" onPress={jsSheet.open} />
        <Chip title="Form sheet" onPress={() => navigation.navigate('Sheet')} />
        <Chip title="Modal" onPress={() => navigation.navigate('Modal')} />
      </SafeAreaView>
      {TRIPS.map((trip) => (
        <View key={trip.code}>
          {/* Scrolling text passes under everything in the column, so it keeps clear of the whole column. */}
          <SafeAreaView edges={['left', 'right']} avoid={avoid}>
            <Text style={styles.when}>{trip.when}</Text>
          </SafeAreaView>
          {/* The card's picture runs under the column; only its text and badge have to stay readable. */}
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate('TripDetails', { code: trip.code })
            }
          >
            <View style={[styles.picture, { backgroundColor: trip.color }]}>
              <Text style={styles.pictureCode}>{trip.code}</Text>
            </View>
            {/* Dynamic: the badge follows its card, and springs in only while it passes a region. */}
            <AnimatedSafeAreaView
              dynamic
              mode="offset"
              edges={['left', 'right']}
              spacing={4}
              avoid={avoid}
              transition={spring}
              style={styles.badge}
            >
              <Text style={styles.badgeText}>Check-in open</Text>
            </AnimatedSafeAreaView>
            <SafeAreaView
              edges={['left', 'right']}
              avoid={avoid}
              style={styles.cardBody}
            >
              <Text style={styles.route}>{trip.route}</Text>
              <Text style={styles.detail}>{trip.detail}</Text>
            </SafeAreaView>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function Chip({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.chip} onPress={onPress}>
      <Text style={styles.chipText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0618' },
  fill: { flex: 1 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#2a2838',
  },
  chipText: { color: '#fff', fontWeight: '600' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#2a2838',
  },
  back: { color: '#fff', fontSize: 30, lineHeight: 30 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '600' },
  signIn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  signInText: { color: '#0b0618', fontWeight: '700' },
  list: {
    paddingHorizontal: 16,
    gap: 8,
  },
  when: { color: '#fff', fontSize: 20, fontWeight: '600', marginVertical: 8 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#211d33' },
  picture: { height: 180, alignItems: 'center', justifyContent: 'center' },
  pictureCode: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 64,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#3a6ee8',
  },
  badgeText: { color: '#fff', fontWeight: '600' },
  cardBody: { padding: 16, gap: 4 },
  route: { color: '#fff', fontSize: 20, fontWeight: '700' },
  detail: { color: '#b8b5c8', fontSize: 15 },
  feedbackPosition: { position: 'absolute', right: 16, bottom: 120 },
  feedback: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#3a3650',
  },
  feedbackText: { color: '#fff', fontWeight: '600' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  nextFlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#3a6ee8',
  },
  nextCode: { color: '#fff', fontSize: 17, fontWeight: '800' },
  nextText: { flex: 1, color: '#fff', fontSize: 15 },
  qr: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  qrText: { color: '#fff', fontSize: 22 },
});
