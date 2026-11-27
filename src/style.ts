import {
  I18nManager,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { EDGES, ZERO_INSETS } from './geometry';
import type { Edge, EdgeInsets, EdgeMode } from './types';

type LayoutKind = 'padding' | 'margin';

/** A style key for padding or margin, without the `padding`/`margin` prefix: `Top`, `InlineStart`, `` (all edges). */
type Suffix =
  | ''
  | 'Top'
  | 'Right'
  | 'Bottom'
  | 'Left'
  | 'Start'
  | 'End'
  | 'Horizontal'
  | 'Vertical'
  | 'Inline'
  | 'InlineStart'
  | 'InlineEnd'
  | 'Block'
  | 'BlockStart'
  | 'BlockEnd';

/**
 * The style keys that decide one physical edge, highest precedence first, as Yoga resolves them in React Native:
 *
 * - `dedicated` keys only touch this edge. `start` and `end` beat `left` and `right` (and `paddingInlineStart` beats
 *   `paddingStart`). In a right-to-left layout `start` is the right edge.
 * - With `I18nManager.doLeftAndRightSwapInRTL` (the default) in a right-to-left app, React Native turns `left` into
 *   `start` and `right` into `end`, ahead of the `start` and `end` keys themselves.
 * - `shared` keys cover the whole axis, or every edge.
 *
 * `fallback` is the key to write when the style has none of the dedicated ones: the one that ends up on this edge.
 */
function edgeKeys(
  edge: Edge,
  rtl: boolean,
  swap: boolean
): { dedicated: Suffix[]; shared: Suffix[]; fallback: Suffix } {
  switch (edge) {
    case 'top':
      return {
        dedicated: ['Top', 'BlockStart'],
        shared: ['Block', 'Vertical', ''],
        fallback: 'Top',
      };
    case 'bottom':
      return {
        dedicated: ['Bottom', 'BlockEnd'],
        shared: ['Block', 'Vertical', ''],
        fallback: 'Bottom',
      };
    case 'left':
    case 'right': {
      const start: Suffix[] = swap
        ? ['Left', 'InlineStart', 'Start']
        : ['InlineStart', 'Start'];
      const end: Suffix[] = swap
        ? ['Right', 'InlineEnd', 'End']
        : ['InlineEnd', 'End'];
      const shared: Suffix[] = ['Inline', 'Horizontal', ''];
      if (edge === 'left') {
        return {
          dedicated: swap
            ? rtl
              ? end
              : start
            : [...(rtl ? end : start), 'Left'],
          shared,
          fallback: swap && rtl ? 'Right' : 'Left',
        };
      }
      return {
        dedicated: swap
          ? rtl
            ? start
            : end
          : [...(rtl ? start : end), 'Right'],
        shared,
        fallback: swap && rtl ? 'Left' : 'Right',
      };
    }
  }
}

/** The view's own padding or margin on one edge, and the key that sets that edge. */
export type OwnEdge = {
  /** The value it has now, or `undefined` when nothing sets it. A percentage or `auto` stays as it is. */
  value: ViewStyle['padding'] | undefined;
  /** The key a new value for this edge goes in, so it wins over whatever sets it now. */
  key: string;
};

export function flattenStyle(style: StyleProp<ViewStyle>): ViewStyle {
  if (typeof StyleSheet?.flatten === 'function') {
    return StyleSheet.flatten(style) ?? {};
  }
  if (!style) return {};
  if (!Array.isArray(style)) {
    return typeof style === 'object' ? (style as ViewStyle) : {};
  }
  const out: Record<string, unknown> = {};
  for (const item of style) {
    if (!item) continue;
    Object.assign(out, Array.isArray(item) ? flattenStyle(item) : item);
  }
  return out as ViewStyle;
}

/**
 * A view's own padding or margin on each physical edge, read the way React Native lays it out: `start`/`end`, the
 * `inline`/`block` aliases, the axis and all-edge shorthands, and right-to-left layouts.
 */
export function ownEdges(
  flat: ViewStyle,
  kind: LayoutKind
): Record<Edge, OwnEdge> {
  const globalRtl = I18nManager?.isRTL === true;
  const rtl =
    flat.direction === 'rtl' || (flat.direction !== 'ltr' && globalRtl);
  // React Native swaps for the whole app, whatever direction a view has.
  const swap = globalRtl && I18nManager?.doLeftAndRightSwapInRTL !== false;
  const style = flat as Record<string, ViewStyle['padding'] | undefined>;
  const out = {} as Record<Edge, OwnEdge>;
  for (const edge of EDGES) {
    const { dedicated, shared, fallback } = edgeKeys(edge, rtl, swap);
    const own = dedicated.find((suffix) => style[kind + suffix] !== undefined);
    const source =
      own ?? shared.find((suffix) => style[kind + suffix] !== undefined);
    out[edge] = {
      value: source === undefined ? undefined : style[kind + source],
      key: kind + (own ?? fallback),
    };
  }
  return out;
}

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
 * `additive` adds the inset to it, `maximum` uses whichever is larger, `off` leaves the edge alone. The element's own
 * value is read the way React Native lays it out, `start`/`end` and right-to-left included, and the result goes in the
 * key that decides that edge.
 *
 * For `margin`, the element's own margin is outside its laid-out box, so `insets` was already measured from inside it
 * (the overlap remaining after the view's own margin). Adding `insets[edge]` to `base` therefore already implements
 * `maximum` semantics (`base + max(0, needed - base) === max(base, needed)`): taking `Math.max(base, insets[edge])`
 * would subtract `base` twice and leave the box `base` pt too close to the region.
 */
export function layoutAdjustment(
  style: StyleProp<ViewStyle>,
  insets: EdgeInsets,
  kind: LayoutKind,
  modes: Readonly<Record<Edge, EdgeMode>>,
  fromOuterBox = false
): LayoutAdjustment {
  if (EDGES.every((edge) => insets[edge] <= 0)) return NO_ADJUSTMENT;
  const flat = flattenStyle(style);
  const own = ownEdges(flat, kind);
  const out: Record<string, number> = {};
  const added: EdgeInsets = { ...ZERO_INSETS };
  for (const edge of EDGES) {
    const mode = modes[edge];
    if (insets[edge] <= 0 || mode === 'off') continue;
    const { value, key } = own[edge];
    if (value !== undefined && typeof value !== 'number')
      warnPercentage(kind, value);
    const base = typeof value === 'number' ? value : 0;
    const next =
      (kind === 'padding' || fromOuterBox) && mode === 'maximum'
        ? Math.max(base, insets[edge])
        : base + insets[edge];
    if (next === base) continue;
    out[key] = next;
    added[edge] = next - base;
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
  const own = flattenStyle(style).transform;
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
