import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-granular-safe-areas';
import { EdgeMarkers } from '../components/EdgeMarkers';

export function MarkersScreen() {
  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['left', 'right']}>
        <Text style={styles.hint}>
          Each marker moves left only while something is beside it. Change the
          system UI and watch them follow.
        </Text>
      </SafeAreaView>
      <EdgeMarkers />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center' },
  hint: { margin: 32, marginRight: 120, fontSize: 15, color: '#3a3a3c' },
});
