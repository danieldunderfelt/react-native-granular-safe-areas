import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaStyle,
} from 'react-native-granular-safe-areas';
import { useAvoid } from '../settings';

const ROWS = Array.from({ length: 24 }, (_, i) => `Setting ${i + 1}`);

/**
 * A settings list as apps build them: rounded rows that clip themselves, each keeping its content clear of the side
 * column with a default `SafeAreaView` inside. However far the list scrolls, every row lines up with the others. And a
 * button whose root is a `Pressable`, kept clear with `useSafeAreaStyle` instead of a wrapper view.
 */
export function SettingsScreen() {
  const avoid = useAvoid();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {ROWS.map((title) => (
        <ListRow key={title} title={title} avoid={avoid} />
      ))}
      <Button title="A button with a Pressable root" avoid={avoid} />
    </ScrollView>
  );
}

function ListRow({
  title,
  avoid,
}: {
  title: string;
  avoid: ReturnType<typeof useAvoid>;
}) {
  const [on, setOn] = useState(false);
  // The row clips itself (rounded corners), and the safe area view inside it keeps 16 pt from the column with `gap`,
  // whether or not the row's padding is its own.
  return (
    <View style={styles.row}>
      <SafeAreaView
        edges={['left', 'right']}
        gap={16}
        avoid={avoid}
        style={styles.rowContent}
      >
        <Text style={styles.rowTitle}>{title}</Text>
        <Switch value={on} onValueChange={setOn} />
      </SafeAreaView>
    </View>
  );
}

/** A general button: the `Pressable` stays the root, so `flex`, stretching and alignment work as before. */
function Button({
  title,
  avoid,
  style,
  ...props
}: PressableProps & {
  title: string;
  avoid: ReturnType<typeof useAvoid>;
  style?: StyleProp<ViewStyle>;
}) {
  const safeArea = useSafeAreaStyle({
    edges: ['left', 'right'],
    avoid,
    style: styles.button,
  });
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && styles.pressed,
        safeArea.style,
      ]}
    >
      {safeArea.probe}
      <Text style={styles.buttonText}>{title}</Text>
      <Text style={styles.buttonText}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 8 },
  row: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowTitle: { fontSize: 16, color: '#000' },
  button: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0a84ff',
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
