import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * A stand-in for the system's glass back button where it isn't drawn natively, so layouts mocked with iPhone Duo
 * metrics (web previews, Android) show it too. The provider draws it at the button's frame.
 */
export function BackButtonStandIn({
  systemImage,
  label,
  onPress,
  style,
}: {
  systemImage: string;
  label?: string;
  onPress: () => unknown;
  style?: StyleProp<ViewStyle>;
}) {
  const close = systemImage === 'xmark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [style, styles.button, pressed && styles.pressed]}
    >
      {close ? (
        <>
          <View style={[styles.line, styles.lineA]} />
          <View style={[styles.line, styles.lineB]} />
        </>
      ) : (
        <View style={styles.chevron} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { opacity: 0.6 },
  chevron: {
    width: 12,
    height: 12,
    marginLeft: 5,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#1c1c1e',
    transform: [{ rotate: '45deg' }],
  },
  line: {
    position: 'absolute',
    width: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#1c1c1e',
  },
  lineA: { transform: [{ rotate: '45deg' }] },
  lineB: { transform: [{ rotate: '-45deg' }] },
});
