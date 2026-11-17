import type * as React from 'react';
import {
  codegenNativeCommands,
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type MetricsChangeEvent = Readonly<{
  /** `GranularSafeAreaMetrics` as JSON, in the provider view's coordinate space. */
  payload: string;
}>;

export interface NativeProps extends ViewProps {
  onMetricsChange?: CodegenTypes.DirectEventHandler<MetricsChangeEvent>;
}

type ComponentType = HostComponent<NativeProps>;

interface NativeCommands {
  /** Re-reads everything, such as system bars that appeared after navigation. Emits only if something changed. */
  refresh: (viewRef: React.ElementRef<ComponentType>) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['refresh'],
});

export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaProviderView'
) as ComponentType;
