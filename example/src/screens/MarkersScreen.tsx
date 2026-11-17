import { StyleSheet, Text, View } from 'react-native';
import { EdgeMarkers } from '../components/EdgeMarkers';

export function MarkersScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>
        Each marker moves left only while something is beside it. Change the
        system UI and watch them follow.
      </Text>
      <EdgeMarkers />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center' },
  hint: { margin: 32, marginRight: 120, fontSize: 15, color: '#3a3a3c' },
});
