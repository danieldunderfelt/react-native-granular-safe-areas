import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  /** The SF Symbol to show, e.g. `chevron.backward`. */
  systemImage: string;
  /** Read by VoiceOver. */
  label?: string;
  /** The id its region in the vertical bar names it by, so views can tell whether it's drawn on top of them. */
  ownerId?: CodegenTypes.Int32;
  // Not `onPress`: `topPress` is already registered as a bubbling event, and an event can't be both.
  onBarButtonPress?: CodegenTypes.DirectEventHandler<Readonly<{}>>;
}

/** A UIKit glass button, the same material UIKit uses for the items in the iPhone Duo's vertical bar. */
export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaBarButton'
) as HostComponent<NativeProps>;
