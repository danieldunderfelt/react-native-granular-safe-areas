import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type WindowChangeEvent = Readonly<{ inWindow: boolean }>;

export interface NativeProps extends ViewProps {
  onWindowChange?: CodegenTypes.DirectEventHandler<WindowChangeEvent>;
  /**
   * The system back button to show for this screen, if it's the one showing: in the screen the anchor is in, at
   * `x`, `y`, `width` and `height` in the provider's coordinates (the window's without a provider).
   */
  button?: Readonly<{
    shown?: CodegenTypes.WithDefault<boolean, false>;
    x?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    y?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    width?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    height?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    /** The SF Symbol to show, e.g. `chevron.backward`. */
    systemImage?: string;
    /** Read by VoiceOver. */
    label?: string;
    /** The id its region names it by, so views can tell whether it's drawn on top of them. */
    ownerId?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
  }>;
  // Not `onPress`: `topPress` is already registered as a bubbling event, and an event can't be both.
  onButtonPress?: CodegenTypes.DirectEventHandler<Readonly<{}>>;
}

/**
 * An empty view in a screen. It reports whether it's in a window (UIKit removes the views of screens that aren't
 * showing: the screens below the top of a navigation stack, unselected tabs), and shows the screen's system back
 * button: a glass button in the iPhone Duo's vertical bar, part of the screen, so it moves and leaves with it.
 */
export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaAnchor'
) as HostComponent<NativeProps>;
