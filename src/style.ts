import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { EDGES, ZERO_INSETS } from './geometry';
import type { Edge, EdgeInsets, EdgeMode } from './types';

type LayoutKind = 'padding' | 'margin';

const SIDE: Record<LayoutKind, Record<Edge, keyof ViewStyle>> = {
  padding: {
    top: 'paddingTop',
    right: 'paddingRight',
    bottom: 'paddingBottom',
    left: 'paddingLeft',
  },
  margin: {
    top: 'marginTop',
    right: 'marginRight',
    bottom: 'marginBottom',
    left: 'marginLeft',
  },
};
const AXIS: Record<LayoutKind, Record<Edge, keyof ViewStyle>> = {
  padding: {
    top: 'paddingVertical',
    right: 'paddingHorizontal',
    bottom: 'paddingVertical',
    left: 'paddingHorizontal',
  },
  margin: {
    top: 'marginVertical',
    right: 'marginHorizontal',
    bottom: 'marginVertical',
    left: 'marginHorizontal',
  },
};

export type LayoutAdjustment = {
  /** The style to put after the element's own, or `null` when nothing changes. */
  style: ViewStyle | null;
  /** How much was added on each edge beyond the element's own padding or margin. */
  added: EdgeInsets;
};

const NO_ADJUSTMENT: LayoutAdjustment = { style: null, added: ZERO_INSETS };

let warnedPercentage = false;

/**
 * Applies `insets` as padding or margin on top of the element's own, per edge like react-native-safe-area-context:
 * `additive` adds the inset to it, `maximum` uses whichever is larger, `off` leaves the edge alone.
 */
export function layoutAdjustment(
  style: StyleProp<ViewStyle>,
  insets: EdgeInsets,
  kind: LayoutKind,
  modes: Readonly<Record<Edge, EdgeMode>>
): LayoutAdjustment {
  if (EDGES.every((edge) => insets[edge] <= 0)) return NO_ADJUSTMENT;
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const out: Record<string, number> = {};
  const added: EdgeInsets = { ...ZERO_INSETS };
  for (const edge of EDGES) {
    const mode = modes[edge];
    if (insets[edge] <= 0 || mode === 'off') continue;
    const own = [
      flat[SIDE[kind][edge]],
      flat[AXIS[kind][edge]],
      flat[kind],
    ].find((value) => value !== undefined);
    if (own !== undefined && typeof own !== 'number') warnPercentage(kind, own);
    const base = typeof own === 'number' ? own : 0;
    const value =
      mode === 'maximum' ? Math.max(base, insets[edge]) : base + insets[edge];
    if (value === base) continue;
    out[SIDE[kind][edge]] = value;
    added[edge] = value - base;
  }
  return Object.keys(out).length > 0
    ? { style: out as ViewStyle, added }
    : NO_ADJUSTMENT;
}

function warnPercentage(kind: LayoutKind, value: unknown) {
  if (!__DEV__ || warnedPercentage) return;
  warnedPercentage = true;
  console.warn(
    `react-native-granular-safe-areas: mode="${kind}" can't add an inset to ${String(value)} ${kind}, so it replaces it. Use a number, or put the percentage on an inner view.`
  );
}

/**
 * Translates the element by the insets, for platforms where the native side doesn't. Ours comes first, so it's in the
 * parent's units even if the element scales.
 */
export function offsetStyle(
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
