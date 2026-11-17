import type { Ref } from 'react';
import { View, type HostInstance } from 'react-native';
import type { NativeProps } from './specs/GranularSafeAreaProviderViewNativeComponent';

// Platforms without native granular metrics yet (web, Android). The provider falls back to the regular insets from
// react-native-safe-area-context, so everything behaves like a regular safe area.

export function NativeProviderView({
  onMetricsChange: _onMetricsChange,
  ...props
}: NativeProps & { ref?: Ref<HostInstance> }) {
  return <View {...props} />;
}

export function refreshNativeProvider(_view: HostInstance | null) {}

export function getInitialWindowMetricsJSON(): string | null {
  return null;
}

export function getDiagnosticsJSON(): Promise<string | null> {
  return Promise.resolve(null);
}
