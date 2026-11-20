import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

/** Light status bar content over a dark header, while the screen is focused. The rest of the app is light. */
export function LightStatusBar() {
  return useIsFocused() ? <StatusBar style="light" /> : null;
}
