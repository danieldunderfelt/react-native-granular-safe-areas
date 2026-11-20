// A stand-in for the library in Jest tests, where there's no native side:
//
//   jest.mock('react-native-granular-safe-areas', () => require('react-native-granular-safe-areas/jest'));
//
// Views render as plain `View`s with no insets, hooks return no regions and zero insets, and the system back button
// shows your own. Everything from react-native-safe-area-context comes through as is; mock it as its README says.
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import type { SafeAreaAccessoryProps, SafeAreaViewProps } from './SafeAreaView';
import type {
  SystemBackButtonProps,
  UseSystemBackButtonResult,
} from './SystemBackButton';
import type { EdgeInsets, SafeAreaRegion } from './types';
import type { SystemControls } from './geometry';

export * from 'react-native-safe-area-context';
export { fixtures } from './fixtures';

const ZERO: EdgeInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
const NO_REGIONS: readonly SafeAreaRegion[] = [];

function viewProps({
  edges: _edges,
  mode: _mode,
  avoid: _avoid,
  spacing: _spacing,
  granular: _granular,
  dynamic: _dynamic,
  underlying: _underlying,
  onInsetsChange: _onInsetsChange,
  ...props
}: SafeAreaViewProps): ViewProps {
  return props;
}

export function SafeAreaView(props: SafeAreaViewProps) {
  return <View {...viewProps(props)} />;
}

export function SafeAreaAccessory({
  edge: _edge,
  ...props
}: SafeAreaAccessoryProps) {
  return <View {...viewProps(props)} />;
}

export function useSafeAreaViewInsets(): EdgeInsets {
  return ZERO;
}

export function useSafeAreaInsetsFor(): EdgeInsets {
  return ZERO;
}

export function useSafeAreaRegions(): readonly SafeAreaRegion[] {
  return NO_REGIONS;
}

export function useSystemControls(): SystemControls | null {
  return null;
}

export function SystemBackButton({ children }: SystemBackButtonProps) {
  return <>{children}</>;
}

export function useSystemBackButton(): UseSystemBackButtonResult {
  return { shown: false, button: <View /> };
}

export function GranularSafeAreaProvider({
  children,
}: {
  children?: ReactNode;
}) {
  return <>{children}</>;
}

export function refreshSafeAreas() {}

export function getDiagnostics(): Promise<Record<string, unknown> | null> {
  return Promise.resolve(null);
}
