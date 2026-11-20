import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type InsetsChangeEvent = Readonly<{
  top: CodegenTypes.Double;
  right: CodegenTypes.Double;
  bottom: CodegenTypes.Double;
  left: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  /**
   * The regions to avoid, in the provider's coordinates, with `avoid`, `spacing` and `scrollable` already applied.
   * `edge`: 0 for a floating region, then 1 top, 2 right, 3 bottom, 4 left.
   */
  regions?: ReadonlyArray<
    Readonly<{
      x: CodegenTypes.Double;
      y: CodegenTypes.Double;
      width: CodegenTypes.Double;
      height: CodegenTypes.Double;
      edge: CodegenTypes.Int32;
    }>
  >;
  /** The edges the view may be pushed in from, as bits: 1 top, 2 right, 4 bottom, 8 left. */
  edges?: CodegenTypes.WithDefault<CodegenTypes.Int32, 15>;
  /** `offset`: the view translates itself. `padding`: it reports its insets with `onInsetsChange` for JS to apply. */
  mode?: CodegenTypes.WithDefault<'offset' | 'padding', 'offset'>;
  onInsetsChange?: CodegenTypes.DirectEventHandler<InsetsChangeEvent>;
}

/**
 * A `View` that follows its own position on screen on the UI thread: as an ancestor scroll view scrolls, and after
 * every layout change. It moves itself clear of the regions it overlaps right now, in the same frame.
 */
export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaDynamicView'
) as HostComponent<NativeProps>;
