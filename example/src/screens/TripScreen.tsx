import { useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  GranularSafeAreaView,
  useGranularSafeArea,
  useGranularSafeAreaInsets,
  useSafeAreaInsets,
} from 'react-native-granular-safe-areas';
import { useAvoid } from '../settings';

const HEADER_HEIGHT = 60;

const TRIPS = [
  {
    when: 'Tomorrow',
    route: 'Helsinki – Lisbon',
    detail: 'Direct · Wed 18 Nov · 16:40',
    color: '#2f6f8f',
    code: 'LIS',
  },
  {
    when: 'December',
    route: 'Lisbon – Funchal',
    detail: 'Direct · Fri 4 Dec · 09:15',
    color: '#8f5a2f',
    code: 'FNC',
  },
  {
    when: 'January',
    route: 'Funchal – Helsinki',
    detail: '1 stop · Sun 10 Jan · 12:05',
    color: '#4b2f8f',
    code: 'HEL',
  },
];

/**
 * A layout like the one in the README's screenshot: a custom header, a scrolling list of cards with a badge, and
 * floating controls. It shows each API: manual insets for the header, the automatic hook for the feedback button, and
 * `GranularSafeAreaView` for the rest.
 */
export function TripScreen() {
  const navigation = useNavigation();
  const avoid = useAvoid();
  const { top } = useSafeAreaInsets();

  // Manual: the header is a full-width strip at the top, so describe it and apply the insets by hand.
  const header = useGranularSafeAreaInsets(
    { top: 0, height: top + HEADER_HEIGHT },
    { avoid }
  );

  // Automatic, as props: the button is measured and moved clear of whatever is beside it.
  const feedback = useGranularSafeArea({
    mode: 'offset',
    edges: ['right', 'bottom'],
    spacing: 8,
    avoid,
    style: styles.feedback,
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingTop: top + HEADER_HEIGHT + 24 },
        ]}
      >
        {TRIPS.map((trip) => (
          <View key={trip.code}>
            <Text style={styles.when}>{trip.when}</Text>
            {/* The card's picture runs under the column; only the badge has to stay readable. */}
            <View style={styles.card}>
              <View style={[styles.picture, { backgroundColor: trip.color }]}>
                <Text style={styles.pictureCode}>{trip.code}</Text>
              </View>
              {/* Scrolling content passes under every region in the column, so it avoids the whole column. */}
              <GranularSafeAreaView
                mode="offset"
                scrollable="vertical"
                edges={['right']}
                spacing={4}
                avoid={avoid}
                style={styles.badge}
              >
                <Text style={styles.badgeText}>Check-in open</Text>
              </GranularSafeAreaView>
              <View style={styles.cardBody}>
                <Text style={styles.route}>{trip.route}</Text>
                <Text style={styles.detail}>{trip.detail}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

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
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.headerTitle} numberOfLines={1}>
          Please sign in again
        </Text>
        <Pressable style={styles.signIn}>
          <Text style={styles.signInText}>Sign in</Text>
        </Pressable>
      </View>

      <Pressable {...feedback.props}>
        <Text style={styles.feedbackText}>Feedback</Text>
      </Pressable>

      {/* Padded clear of the home indicator, and of a vertical tab bar if one is beside it. */}
      <GranularSafeAreaView
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
      </GranularSafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0618' },
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
    paddingBottom: 160,
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
  feedback: {
    position: 'absolute',
    right: 16,
    bottom: 120,
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
