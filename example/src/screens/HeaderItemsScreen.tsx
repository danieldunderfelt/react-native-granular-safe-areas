import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackHeaderItem,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../navigation';
import { EdgeMarkers } from '../components/EdgeMarkers';
import { ProbeScreen } from './ProbeScreen';

const SYMBOLS = [
  'magnifyingglass',
  'square.and.arrow.up',
  'star',
  'bell',
  'gear',
] as const;

/**
 * Reactivity test: change the number of native header items. On the Duo they sit in the vertical bar, which grows
 * and shrinks with them, and the markers on the right edge follow it.
 */
export function HeaderItemsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [count, setCount] = useState(2);

  useLayoutEffect(() => {
    navigation.setOptions({
      unstable_headerRightItems: () =>
        SYMBOLS.slice(0, count).map((name): NativeStackHeaderItem => ({
          type: 'button',
          label: name,
          icon: { type: 'sfSymbol', name },
          onPress: () => Alert.alert(name),
        })),
    });
  }, [navigation, count]);

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Button
          title="Fewer items"
          disabled={count === 0}
          onPress={() => setCount(count - 1)}
        />
        <Text>{count}</Text>
        <Button
          title="More items"
          disabled={count === SYMBOLS.length}
          onPress={() => setCount(count + 1)}
        />
      </View>
      <ProbeScreen />
      <EdgeMarkers />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
});
