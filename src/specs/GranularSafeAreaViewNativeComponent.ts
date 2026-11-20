import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type AccessoryChangeEvent = Readonly<{
  /** Whether it's drawn at all: in a window, and in the provider's view of it. */
  visible: boolean;
  x: CodegenTypes.Double;
  y: CodegenTypes.Double;
  width: CodegenTypes.Double;
  height: CodegenTypes.Double;
}>;

export type InsetsChangeEvent = Readonly<{
  top: CodegenTypes.Double;
  right: CodegenTypes.Double;
  bottom: CodegenTypes.Double;
  left: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  /**
   * The regions broken down as far as the platform allows. In the provider's coordinates, with `avoid` and `spacing`
   * applied. `edge`: 0 for a floating region, then 1 top, 2 right, 3 bottom, 4 left. `side`: the other edge of a
   * corner region (iPad window controls), coded the same way, or 0. `owner`: the view that draws it
   * (a bar, an accessory), which only covers what's drawn beneath it; 0 for system UI, which covers everything.
   * `band`: a whole inset band.
   */
  regions?: ReadonlyArray<
    Readonly<{
      x: CodegenTypes.Double;
      y: CodegenTypes.Double;
      width: CodegenTypes.Double;
      height: CodegenTypes.Double;
      edge: CodegenTypes.Int32;
      side: CodegenTypes.Int32;
      owner: CodegenTypes.Int32;
      band: boolean;
    }>
  >;
  /** The same with whole bands, for views that aren't `dynamic`. */
  bands?: ReadonlyArray<
    Readonly<{
      x: CodegenTypes.Double;
      y: CodegenTypes.Double;
      width: CodegenTypes.Double;
      height: CodegenTypes.Double;
      edge: CodegenTypes.Int32;
      side: CodegenTypes.Int32;
      owner: CodegenTypes.Int32;
      band: boolean;
    }>
  >;
  /** The edges the view may be pushed in from, as bits: 1 top, 2 right, 4 bottom, 8 left. */
  edges?: CodegenTypes.WithDefault<CodegenTypes.Int32, 15>;
  granular?: CodegenTypes.WithDefault<boolean, false>;
  /** Follow the view as it moves. */
  dynamic?: CodegenTypes.WithDefault<boolean, false>;
  /** `mode="offset"`: the view translates itself. */
  applyOffset?: CodegenTypes.WithDefault<boolean, false>;
  /** Send `onInsetsChange` when the insets change, for JS to apply them as padding or margin, or to pass them on. */
  reportInsets?: CodegenTypes.WithDefault<boolean, false>;
  /** `mode="margin"`: the margin JS added, which moved the view's box in. It's measured without it. */
  margins?: Readonly<{
    top?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    right?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    bottom?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    left?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  }>;
  /**
   * What JS measured from React Native's layout before the first frame. The view starts from it, and keeps it until
   * it can measure itself, e.g. once the screen it's in has finished its transition.
   */
  initialInsets?: Readonly<{
    top?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    right?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    bottom?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    left?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  }>;
  onInsetsChange?: CodegenTypes.DirectEventHandler<InsetsChangeEvent>;
  /** Also avoid app UI drawn beneath the view, for transparent overlays that should keep clear of it anyway. */
  underlying?: CodegenTypes.WithDefault<boolean, false>;
  /**
   * `SafeAreaAccessory`: the id the view registers under as a region owner, and reports where it's drawn with
   * `onAccessoryChange`. 0 for a plain `SafeAreaView`.
   */
  ownerId?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
  onAccessoryChange?: CodegenTypes.DirectEventHandler<AccessoryChangeEvent>;
}

/**
 * The native side of `SafeAreaView`: a `View` that measures itself in its provider, and works out the insets it needs.
 * It applies `offset` itself and reports the rest. A `dynamic` one follows its own position as it moves.
 */
export default codegenNativeComponent<NativeProps>(
  'GranularSafeAreaView'
) as HostComponent<NativeProps>;
