import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { EDGES } from './geometry';
import type { Edge, EdgeInsets, GranularSafeAreaMode } from './types';

const PADDING: Record<Edge, keyof ViewStyle> = {
  top: 'paddingTop',
  right: 'paddingRight',
  bottom: 'paddingBottom',
  left: 'paddingLeft',
};
const AXIS_PADDING: Record<Edge, keyof ViewStyle> = {
  top: 'paddingVertical',
  right: 'paddingHorizontal',
  bottom: 'paddingVertical',
  left: 'paddingHorizontal',
};

/** The style that applies `insets` to an element whose own style is `style`. `null` when there is nothing to do. */
export function adjustmentStyle(
  style: StyleProp<ViewStyle>,
  insets: EdgeInsets,
  mode: GranularSafeAreaMode
): ViewStyle | null {
  return mode === 'offset'
    ? offsetStyle(style, insets)
    : paddingStyle(style, insets);
}

let warnedPercentage = false;

/** Adds the insets to the padding the element already has on each edge. */
function paddingStyle(
  style: StyleProp<ViewStyle>,
  insets: EdgeInsets
): ViewStyle | null {
  if (EDGES.every((edge) => insets[edge] <= 0)) return null;
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const out: Record<string, number> = {};
  for (const edge of EDGES) {
    if (insets[edge] <= 0) continue;
    const base = [
      flat[PADDING[edge]],
      flat[AXIS_PADDING[edge]],
      flat.padding,
    ].find((value) => value !== undefined);
    if (
      base !== undefined &&
      typeof base !== 'number' &&
      __DEV__ &&
      !warnedPercentage
    ) {
      warnedPercentage = true;
      console.warn(
        `react-native-granular-safe-areas: mode="padding" can't add an inset to ${String(base)} padding, so it replaces it on the ${edge} edge. Use numeric padding, or put the percentage on an inner view.`
      );
    }
    out[PADDING[edge]] = (typeof base === 'number' ? base : 0) + insets[edge];
  }
  return out;
}

/** Translates the element by the insets. Ours comes first, so it's in the parent's units even if the element scales. */
function offsetStyle(
  style: StyleProp<ViewStyle>,
  insets: EdgeInsets
): ViewStyle | null {
  const dx = insets.left - insets.right;
  const dy = insets.top - insets.bottom;
  if (dx === 0 && dy === 0) return null;
  const own = StyleSheet.flatten(style)?.transform;
  if (typeof own === 'string') {
    if (__DEV__) {
      console.warn(
        'react-native-granular-safe-areas: mode="offset" cannot combine with a string transform. Use the array form.'
      );
    }
    return null;
  }
  return {
    transform: [{ translateX: dx }, { translateY: dy }, ...(own ?? [])],
  };
}
