import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-granular-safe-areas';
import { useAvoid } from './settings';

type JsSheet = { open: () => void; close: () => void };

const JsSheetContext = createContext<JsSheet | null>(null);

export function useJsSheet(): JsSheet {
  const sheet = useContext(JsSheetContext);
  if (!sheet) throw new Error('useJsSheet needs a JsSheetProvider');
  return sheet;
}

/**
 * A bottom sheet drawn in JavaScript, the way bottom sheet libraries do it: rendered at the root of the app, after the
 * navigation, so it's drawn on top of every screen, their tab bars and their accessories.
 */
export function JsSheetProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const sheet = useMemo(
    () => ({ open: () => setShown(true), close: () => setShown(false) }),
    []
  );
  return (
    <JsSheetContext.Provider value={sheet}>
      {children}
      {shown ? (
        <View style={styles.backdrop}>
          <Pressable style={styles.dismiss} onPress={sheet.close} />
          <View style={styles.jsSheet}>
            <OverlayContent title="JS sheet" onClose={sheet.close} />
          </View>
        </View>
      ) : null}
    </JsSheetContext.Provider>
  );
}

/**
 * What every overlay in the example shows: a list, and a footer kept clear of what can cover it. In a sheet or modal
 * that's the home indicator (and on the iPhone Duo, the status cluster when it reaches it), but not the tab bar and
 * the boarding pass bar of the screen underneath.
 */
export function OverlayContent({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const avoid = useAvoid();
  const [bottom, setBottom] = useState(0);
  return (
    <View style={styles.overlay}>
      <SafeAreaView
        granular
        edges={['top', 'left', 'right']}
        avoid={avoid}
        style={styles.header}
      >
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right']} avoid={avoid} style={styles.list}>
        {ROWS.map((row) => (
          <Text key={row} style={styles.row}>
            {row}
          </Text>
        ))}
      </SafeAreaView>
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        avoid={avoid}
        onInsetsChange={(insets) => setBottom(insets.bottom)}
        style={styles.footer}
      >
        <Text style={styles.footerText}>
          Bottom inset: {Math.round(bottom)} pt
        </Text>
        <Pressable style={styles.done} onPress={onClose}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const ROWS = [
  'Seat 14A, window',
  'One cabin bag, 8 kg',
  'Priority boarding',
  'Lounge access',
  'Meal: vegetarian',
  'Wi-Fi: included',
];

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  dismiss: { flex: 1 },
  jsSheet: {
    height: '55%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  overlay: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d1d1d6',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#000' },
  close: { fontSize: 17, color: '#007aff' },
  list: { flex: 1 },
  row: {
    fontSize: 16,
    color: '#1c1c1e',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d1d6',
    backgroundColor: '#f2f2f7',
  },
  footerText: { fontSize: 13, color: '#6e6e73', textAlign: 'center' },
  done: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#007aff',
  },
  doneText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
