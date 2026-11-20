import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type WindowChangeEvent = Readonly<{ inWindow: boolean }>;

export interface NativeProps extends ViewProps {
  onWindowChange?: CodegenTypes.DirectEventHandler<WindowChangeEvent>;
}

/**
 * An empty view that reports whether it is in a window. UIKit removes the views of screens that aren't showing (the
 * screens below the top of a navigation stack, unselected tabs), so this tells whether a screen is visible without
 * depending on a navigation library.
 */
export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaAnchor'
) as HostComponent<NativeProps>;
