import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-granular-safe-areas';
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
] as const;

const ROW = 44;

/**
 * Three pills on the right edge, moved up and down together by an animation on Animated's native driver, so nothing
 * runs in JavaScript while they move. Only the dynamic one follows its position. Tap to pause.
 */
export function MovingScreen() {
  const avoid = useAvoid();
  const progress = useRef(new Animated.Value(0)).current;
  const [running, setRunning] = useState(true);
  const [height, setHeight] = useState(0);
  const travel = Math.max(0, height - BEHAVIORS.length * ROW);

  useEffect(() => {
    if (!running) return undefined;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 6000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [running, progress]);

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
      <Animated.View
        style={[
          styles.slider,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, travel],
                }),
              },
            ],
          },
        ]}
      >
        {BEHAVIORS.map((behavior) => (
          <View key={behavior.label} style={styles.row}>
            <SafeAreaView
              {...behavior.props}
              mode="offset"
              edges={['right']}
              spacing={4}
              avoid={avoid}
              style={[styles.pill, { backgroundColor: behavior.color }]}
            >
              <Text style={styles.pillText}>{behavior.label}</Text>
            </SafeAreaView>
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
