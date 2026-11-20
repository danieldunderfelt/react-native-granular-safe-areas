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
  // Not `onPress`: `topPress` is already registered as a bubbling event, and an event can't be both.
  onBarButtonPress?: CodegenTypes.DirectEventHandler<Readonly<{}>>;
}

/** A UIKit glass button, the same material UIKit uses for the items in the iPhone Duo's vertical bar. */
export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaBarButton'
) as HostComponent<NativeProps>;
