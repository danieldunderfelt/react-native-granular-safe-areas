import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-granular-safe-areas';
import { AnimatedSafeAreaView } from 'react-native-granular-safe-areas/reanimated';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAvoid } from '../settings';

const BEHAVIORS = [
  {
    label: 'default',
    note: 'Avoids the whole band',
    props: {},
    color: '#8e8e93',
  },
  {
    label: 'granular',
    note: 'Measured where it was laid out',
    props: { granular: true },
    color: '#ff9500',
  },
  {
    label: 'dynamic',
    note: 'Follows itself as it moves',
    props: { dynamic: true },
    color: '#34c759',
  },
  {
    label: 'dynamic, springy',
    note: 'The same, animated with Reanimated',
    props: { dynamic: true, transition: spring },
    color: '#007aff',
  },
] as const;

const ROW = 44;

function spring(to: number) {
  'worklet';
  return withSpring(to, { damping: 18, stiffness: 220 });
}

/**
 * Pills on the right edge, moved up and down together by a Reanimated animation on the UI thread, so nothing runs in
 * JavaScript while they move. Only the dynamic ones follow their position; the last one animates the change. Tap to
 * pause.
 */
export function MovingScreen() {
  const avoid = useAvoid();
  const progress = useSharedValue(0);
  const [running, setRunning] = useState(true);
  const [height, setHeight] = useState(0);
  const travel = Math.max(0, height - BEHAVIORS.length * ROW);

  useEffect(() => {
    if (!running) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration: 6000 }), -1, true);
  }, [running, progress]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * travel }],
  }));

  return (
    <Pressable
      style={styles.screen}
      onPress={() => setRunning((r) => !r)}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <SafeAreaView edges={['left', 'right']} style={styles.legend}>
        {BEHAVIORS.map((behavior) => (
          <Text key={behavior.label} style={styles.legendRow}>
            <Text style={[styles.legendLabel, { color: behavior.color }]}>
              {behavior.label}
            </Text>
            {`  ${behavior.note}`}
          </Text>
        ))}
        <Text style={styles.hint}>
          {running ? 'Tap to pause.' : 'Paused. Tap to move.'}
        </Text>
      </SafeAreaView>
      <Animated.View style={[styles.slider, slide]}>
        {BEHAVIORS.map((behavior) => (
          <View key={behavior.label} style={styles.row}>
            <AnimatedSafeAreaView
              {...behavior.props}
              mode="offset"
              edges={['right']}
              spacing={4}
              avoid={avoid}
              style={[styles.pill, { backgroundColor: behavior.color }]}
            >
              <Text style={styles.pillText}>{behavior.label}</Text>
            </AnimatedSafeAreaView>
          </View>
        ))}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7' },
  legend: { position: 'absolute', left: 0, right: 0, top: '40%', padding: 24 },
  legendRow: { fontSize: 15, color: '#3a3a3c', marginBottom: 6 },
  legendLabel: { fontWeight: '700' },
  hint: { marginTop: 12, fontSize: 13, color: '#8e8e93' },
  slider: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'none',
  },
  row: { height: ROW, justifyContent: 'center', alignItems: 'flex-end' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 4,
  },
  pillText: { color: '#fff', fontWeight: '700' },
});
