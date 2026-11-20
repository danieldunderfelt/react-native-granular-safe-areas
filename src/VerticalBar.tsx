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
import type { VerticalBar } from './geometry';
import { useGranularSafeAreaStore } from './hooks';
import { AnchorView } from './nativeBridge';
import type { VerticalBarBackButtonIcon } from './store';

/**
 * The system's vertical bar where the nearest provider is, or `null` when there isn't one. On the iPhone Duo it's the
 * column on the trailing edge (outer display, and inner display in landscape) with the status cluster at the top and
 * bar items below it. Re-renders when it changes.
 */
export function useVerticalBar(): VerticalBar | null {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().verticalBar
  );
}

export type UseVerticalBarBackButtonOptions = {
  /** Called when the back button in the vertical bar is pressed. */
  onPress: () => unknown;
  /** Turn the vertical bar button off, e.g. while the screen can't go back. Defaults to `true`. */
  enabled?: boolean;
  /** `back` (default) shows a chevron, `close` a cross, for modals. */
  icon?: VerticalBarBackButtonIcon;
  /** Read by VoiceOver. Defaults to "Back", or "Close" with the `close` icon. */
  accessibilityLabel?: string;
};

export type UseVerticalBarBackButtonResult = {
  /** `true` while the button is shown in the vertical bar. Hide your own back button then. */
  inVerticalBar: boolean;
  /**
   * Render this in the same screen as your back button. It's an invisible view that tells the library whether the
   * screen is showing, so a screen below the top of a stack or in another tab doesn't keep the button.
   */
  anchor: ReactElement;
};

/**
 * Puts a back button in the vertical bar, the way UIKit does for a navigation controller: on the iPhone Duo it sits
 * at the top of the bar, right below the status cluster. Use it for screens with a custom header, which don't get the
 * system's button. Where there is no vertical bar, `inVerticalBar` is `false` and your own back button stays.
 *
 * When several screens offer one, the most recent screen that is showing wins. `VerticalBarBackButton` is this hook
 * as a component.
 */
export function useVerticalBarBackButton({
  onPress,
  enabled = true,
  icon = 'back',
  accessibilityLabel = icon === 'close' ? 'Close' : 'Back',
}: UseVerticalBarBackButtonOptions): UseVerticalBarBackButtonResult {
  const store = useGranularSafeAreaStore();
  const [id] = useState(() => store.createBackButtonId());
  const onPressRef = useRef(onPress);
  useLayoutEffect(() => {
    onPressRef.current = onPress;
  });

  // Registered in a layout effect, so the first frame already shows the button instead of the app's own.
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

  const inVerticalBar = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().backButton?.owner === id
  );

  const anchor = useMemo(
    () => (
      <AnchorView
        style={styles.anchor}
        onWindowChange={(event) =>
          store.updateBackButton(id, { inWindow: event.nativeEvent.inWindow })
        }
      />
    ),
    [store, id]
  );

  return { inVerticalBar, anchor };
}

export type VerticalBarBackButtonProps = UseVerticalBarBackButtonOptions & {
  /** Your own back button. It's shown where there is no vertical bar, and hidden while the bar shows the button. */
  children?: ReactNode;
};

/**
 * Wrap your custom back button in this to make it native on the iPhone Duo: there it moves into the vertical bar,
 * right below the status cluster, as a system-style glass button. Everywhere else your button stays as it is.
 *
 * ```tsx
 * <VerticalBarBackButton onPress={navigation.goBack}>
 *   <MyBackButton onPress={navigation.goBack} />
 * </VerticalBarBackButton>
 * ```
 */
export function VerticalBarBackButton({
  children,
  ...options
}: VerticalBarBackButtonProps) {
  const { inVerticalBar, anchor } = useVerticalBarBackButton(options);
  return (
    <>
      {anchor}
      {inVerticalBar ? null : children}
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
