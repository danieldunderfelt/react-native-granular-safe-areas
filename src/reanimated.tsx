import { useLayoutEffect, useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useEvent,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { edgeModes, ZERO_INSETS } from './geometry';
import { NativeSafeAreaView } from './nativeBridge';
import {
  ChildInsets,
  SafeAreaView,
  useNativeSafeArea,
  type SafeAreaViewProps,
} from './SafeAreaView';
import type {
  InsetsChangeEvent,
  NativeProps,
} from './specs/GranularSafeAreaViewNativeComponent';

type NativeInsetsHandler = NonNullable<NativeProps['onInsetsChange']>;
import { layoutAdjustment } from './style';
import type { Edge, EdgeInsets, EdgeMode } from './types';

export type AnimatedSafeAreaViewProps = SafeAreaViewProps & {
  /**
   * Animates every change of the insets with a Reanimated animation. A worklet that takes the value to go to and
   * returns the animation: `(to) => { 'worklet'; return withSpring(to); }`. Applies to `offset` and `padding`; `margin`
   * changes layout around the view, so it changes without animating.
   */
  transition?: (toValue: number) => number;
  /**
   * A shared value the view writes its insets to on the UI thread, for animations of your own. Use it with
   * `mode="none"` to apply them yourself.
   */
  insets?: SharedValue<EdgeInsets>;
};

const AnimatedNativeView = NativeSafeAreaView
  ? Animated.createAnimatedComponent(NativeSafeAreaView)
  : null;
const AnimatedMeasuredView = Animated.createAnimatedComponent(SafeAreaView);

/**
 * A `SafeAreaView` whose insets Reanimated applies, so they can animate: a badge slides in as it passes the OS UI
 * instead of jumping. Everything else is `SafeAreaView`'s, `dynamic` included.
 *
 * ```tsx
 * <AnimatedSafeAreaView dynamic mode="offset" transition={(to) => { 'worklet'; return withSpring(to); }}>
 * ```
 *
 * On iOS, the native view's reports go straight to the UI thread, the way `useAnimatedScrollHandler` gets scroll
 * events, so the animation starts on the next frame without a trip through JavaScript. Elsewhere they come from JS.
 */
export function AnimatedSafeAreaView(props: AnimatedSafeAreaViewProps) {
  return AnimatedNativeView ? (
    <NativeAnimatedSafeAreaView {...props} />
  ) : (
    <MeasuredAnimatedSafeAreaView {...props} />
  );
}

/** What the animated style needs from the view's own style: its padding on each edge, and its transform. */
function useOwnStyle(style: SafeAreaViewProps['style']) {
  return useMemo(() => {
    const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
    const padding = (side: keyof ViewStyle, axis: keyof ViewStyle) => {
      const value = [flat[side], flat[axis], flat.padding].find(
        (v) => v !== undefined
      );
      return typeof value === 'number' ? value : 0;
    };
    return {
      padding: {
        top: padding('paddingTop', 'paddingVertical'),
        right: padding('paddingRight', 'paddingHorizontal'),
        bottom: padding('paddingBottom', 'paddingVertical'),
        left: padding('paddingLeft', 'paddingHorizontal'),
      },
      transform: Array.isArray(flat.transform) ? flat.transform : [],
    };
  }, [style]);
}

/** The style that applies the insets in `insets`, animated with `transition`. */
function useInsetsStyle(
  insets: SharedValue<EdgeInsets>,
  mode: AnimatedSafeAreaViewProps['mode'],
  modes: Readonly<Record<Edge, EdgeMode>>,
  transition: AnimatedSafeAreaViewProps['transition'],
  style: SafeAreaViewProps['style']
) {
  const own = useOwnStyle(style);
  return useAnimatedStyle(() => {
    const current = insets.value;
    const animate = (value: number) => (transition ? transition(value) : value);
    if (mode === 'offset') {
      return {
        transform: [
          { translateX: animate(current.left - current.right) },
          { translateY: animate(current.top - current.bottom) },
          ...own.transform,
        ],
      } as ViewStyle;
    }
    if (mode === 'padding' || mode === undefined) {
      const out: Record<string, number> = {};
      const sides = [
        ['top', 'paddingTop'],
        ['right', 'paddingRight'],
        ['bottom', 'paddingBottom'],
        ['left', 'paddingLeft'],
      ] as const;
      for (const [edge, property] of sides) {
        const edgeMode = modes[edge];
        if (edgeMode === 'off') continue;
        const base = own.padding[edge];
        out[property] = animate(
          edgeMode === 'maximum'
            ? Math.max(base, current[edge])
            : base + current[edge]
        );
      }
      return out;
    }
    return {};
  });
}

/** iOS: the native view reports to the UI thread, where Reanimated applies the insets. */
function NativeAnimatedSafeAreaView({
  edges,
  mode = 'padding',
  avoid,
  spacing,
  granular,
  dynamic,
  underlying,
  onInsetsChange,
  transition,
  insets: external,
  style,
  children,
  ref,
  ...rest
}: AnimatedSafeAreaViewProps) {
  const NativeView = AnimatedNativeView!;
  const native = useNativeSafeArea({
    edges,
    avoid,
    spacing,
    granular,
    dynamic,
    underlying,
    onInsetsChange,
    ref,
  });
  const own = useSharedValue<EdgeInsets>(ZERO_INSETS);
  const insets = external ?? own;

  // Start from what JS measured before the first frame, until the native side reports.
  const { initialInsets } = native.props;
  useLayoutEffect(() => {
    insets.value = initialInsets;
  }, [insets, initialInsets]);

  const { report } = native;
  const handleInsetsChange = useEvent<InsetsChangeEvent>(
    (event) => {
      'worklet';
      const next = {
        top: event.top,
        right: event.right,
        bottom: event.bottom,
        left: event.left,
      };
      insets.value = next;
      scheduleOnRN(report, next);
    },
    ['onInsetsChange']
  );

  // Margin moves the view's own box, which the native side measures, so it isn't animated: it's applied from JS.
  const animatedMode = mode === 'margin' ? 'none' : mode;
  const animatedStyle = useInsetsStyle(
    insets,
    animatedMode,
    native.modes,
    transition,
    style
  );
  const margin =
    mode === 'margin'
      ? layoutAdjustment(style, native.insets, 'margin', native.modes)
      : null;

  return (
    <NativeView
      {...rest}
      {...native.props}
      applyOffset={false}
      reportInsets
      margins={margin?.added ?? ZERO_INSETS}
      // Reanimated's worklet handler poses as a plain function; it registers it on the UI thread.
      onInsetsChange={handleInsetsChange as unknown as NativeInsetsHandler}
      style={[style, margin?.style, animatedStyle]}
    >
      <ChildInsets insets={mode === 'offset' ? ZERO_INSETS : native.insets}>
        {children}
      </ChildInsets>
    </NativeView>
  );
}

/** The web, and Android for now: the view measures itself from JS and hands the insets to Reanimated. */
function MeasuredAnimatedSafeAreaView({
  mode = 'padding',
  transition,
  insets: external,
  onInsetsChange,
  style,
  edges,
  ...rest
}: AnimatedSafeAreaViewProps) {
  const own = useSharedValue<EdgeInsets>(ZERO_INSETS);
  const insets = external ?? own;
  const modes = useMemo(() => edgeModes(edges), [edges]);
  const animatedStyle = useInsetsStyle(
    insets,
    mode === 'margin' ? 'none' : mode,
    modes,
    transition,
    style
  );
  return (
    <AnimatedMeasuredView
      {...rest}
      edges={edges}
      mode={mode === 'margin' ? 'margin' : 'none'}
      onInsetsChange={(next) => {
        insets.value = next;
        onInsetsChange?.(next);
      }}
      style={[style, animatedStyle]}
    />
  );
}
