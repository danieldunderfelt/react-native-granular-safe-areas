import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { StyleSheet } from 'react-native';
import { useGranularSafeAreaStore } from './hooks';
import { AnchorView } from './nativeBridge';
import type { BackButtonIcon } from './store';

export type SystemBackButtonIcon = BackButtonIcon;

export type UseSystemBackButtonOptions = {
  /** Called when the system back button is pressed. */
  onPress: () => unknown;
  /** Turn the system back button off, e.g. while the screen can't go back. Defaults to `true`. */
  enabled?: boolean;
  /** `back` (default) shows a chevron, `close` a cross, for modals. */
  icon?: SystemBackButtonIcon;
  /** Read by VoiceOver. Defaults to "Back", or "Close" with the `close` icon. */
  accessibilityLabel?: string;
};

export type UseSystemBackButtonResult = {
  /** `true` while the system shows the back button. Hide your own back button then. */
  shown: boolean;
  /**
   * Render this anywhere in the screen. It's an invisible view that tells the library whether the screen is showing,
   * and draws the system back button, as part of the screen, so it moves and leaves with it.
   */
  button: ReactElement;
};

/**
 * Puts a back button where the system has a place for one in its own controls, the way UIKit does for a navigation
 * controller: on the iPhone Duo, at the top of the vertical bar, right below the status cluster. Use it for screens with
 * a custom header, which don't get the system's button. Where there's no such place, `shown` is `false` and your own
 * back button stays.
 *
 * When several screens offer one, the most recent screen that is showing wins. `SystemBackButton` is this hook as a
 * component.
 */
export function useSystemBackButton({
  onPress,
  enabled = true,
  icon = 'back',
  accessibilityLabel = icon === 'close' ? 'Close' : 'Back',
}: UseSystemBackButtonOptions): UseSystemBackButtonResult {
  const store = useGranularSafeAreaStore();
  const [id] = useState(() => store.createBackButtonId());
  const onPressRef = useRef(onPress);
  useLayoutEffect(() => {
    onPressRef.current = onPress;
  });

  // Registered in a layout effect, so the first frame already shows the system's button instead of the app's own.
  const initial = useRef({ enabled, icon, accessibilityLabel });
  useLayoutEffect(() => {
    store.registerBackButton(id, {
      ...initial.current,
      onPress: () => onPressRef.current(),
      inWindow: true,
    });
    return () => store.unregisterBackButton(id);
  }, [store, id]);
  useLayoutEffect(() => {
    store.updateBackButton(id, { enabled, icon, accessibilityLabel });
  }, [store, id, enabled, icon, accessibilityLabel]);

  const state = useSyncExternalStore(store.subscribe, () => {
    const button = store.getSnapshot().backButton;
    return button?.owner === id ? button : null;
  });

  const button = useMemo(
    () => (
      <AnchorView
        style={styles.anchor}
        onWindowChange={(event) =>
          store.updateBackButton(id, { inWindow: event.nativeEvent.inWindow })
        }
        button={
          state
            ? {
                shown: true,
                ...state.frame,
                systemImage:
                  state.icon === 'close' ? 'xmark' : 'chevron.backward',
                label: state.accessibilityLabel,
                ownerId: store.backButtonOwnerId,
              }
            : undefined
        }
        onButtonPress={store.pressBackButton}
      />
    ),
    [store, id, state]
  );

  return { shown: state !== null, button };
}

export type SystemBackButtonProps = UseSystemBackButtonOptions & {
  /** Your own back button. It's shown where the system has no place for one, and hidden while the system shows it. */
  children?: ReactNode;
};

/**
 * Wrap your custom back button in this to make it native where the system has a place for one: on the iPhone Duo it
 * moves into the vertical bar, right below the status cluster, as a system glass button. Everywhere else your button
 * stays as it is.
 *
 * ```tsx
 * <SystemBackButton onPress={navigation.goBack}>
 *   <MyBackButton onPress={navigation.goBack} />
 * </SystemBackButton>
 * ```
 */
export function SystemBackButton({
  children,
  ...options
}: SystemBackButtonProps) {
  const { shown, button } = useSystemBackButton(options);
  return (
    <>
      {button}
      {shown ? null : children}
    </>
  );
}

const styles = StyleSheet.create({
  // 1 pt rather than 0: a zero-size view can be culled, which would take it out of the window.
  anchor: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
  },
});
