// The system's header controls for React Navigation's native stack:
//
//   import { useSystemHeaderItems } from 'react-native-granular-safe-areas/native-stack';
//
// For Expo Router, use 'react-native-granular-safe-areas/expo-router'.
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackHeaderItem,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import {
  useSystemHeaderItemsFor,
  type HeaderNavigation,
  type SystemHeaderItemsOptions,
  type SystemHeaderItemsResult,
} from './systemHeader';

export type UseSystemHeaderItemsOptions = SystemHeaderItemsOptions<
  NativeStackHeaderItem,
  NativeStackNavigationOptions
> & {
  /** The screen's navigation object. Defaults to `useNavigation()`. */
  navigation?: HeaderNavigation;
};

export type { SystemHeaderItemsResult };

/**
 * Header buttons drawn by the system, for screens with a header of their own (`headerShown: false`).
 *
 * Where the system has a place for its controls (the iPhone Duo closed, or open in landscape), the screen gets a native
 * header that is transparent and empty, with your items: UIKit puts its back button and the items in the vertical bar,
 * as Liquid Glass, exactly as for a screen with a native header. Touches go through the empty header, and your own
 * header still reaches the top. Everywhere else the screen gets `fallback` (by default `{ headerShown: false }`), and
 * your own header shows its own buttons.
 *
 * ```tsx
 * const { shown } = useSystemHeaderItems({
 *   headerRightItems: [{ type: 'button', label: 'Share', icon: { type: 'sfSymbol', name: 'square.and.arrow.up' }, onPress: share }],
 * });
 * return <MyHeader back={!shown} actions={!shown} />;
 * ```
 *
 * It sets the screen's options, so don't set the same header options elsewhere for that screen; put them in `fallback`.
 */
export function useSystemHeaderItems(
  options: UseSystemHeaderItemsOptions = {}
): SystemHeaderItemsResult {
  const fromContext = useNavigation();
  return useSystemHeaderItemsFor(options.navigation ?? fromContext, options);
}
