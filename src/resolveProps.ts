import { EDGES, edgeModes } from './geometry';
import type {
  Edge,
  EdgeMode,
  Edges,
  GranularSafeAreaMode,
  SafeAreaRegionKind,
} from './types';

/** The options `SafeAreaDefaults` can set for the views inside it. */
export type SafeAreaDefaultsOptions = {
  edges?: Edges;
  mode?: GranularSafeAreaMode;
  granular?: boolean;
  avoid?: readonly SafeAreaRegionKind[];
  spacing?: number;
  gap?: number;
  underlying?: boolean;
};

const DEFAULT_KEYS = [
  'edges',
  'mode',
  'granular',
  'avoid',
  'spacing',
  'gap',
  'underlying',
] as const satisfies readonly (keyof SafeAreaDefaultsOptions)[];

/** `defaults` on top of `parent`: nested `SafeAreaDefaults` add to the ones around them. */
export function mergeDefaults(
  parent: SafeAreaDefaultsOptions,
  defaults: SafeAreaDefaultsOptions
): SafeAreaDefaultsOptions {
  const merged: Record<string, unknown> = { ...parent };
  for (const name of DEFAULT_KEYS) {
    if (defaults[name] !== undefined) merged[name] = defaults[name];
  }
  return merged as SafeAreaDefaultsOptions;
}

/**
 * The props a view goes by: its own, then `defaults` for the ones it leaves out, with `gap` turned into what it means:
 * `spacing` (the larger of the two), and `'maximum'` for every additive edge, so the view's own padding counts towards
 * the gap.
 */
export function resolveSafeAreaProps<P extends SafeAreaDefaultsOptions>(
  props: P,
  defaults: SafeAreaDefaultsOptions
): Omit<P, 'gap'> {
  const merged: Record<string, unknown> = { ...props };
  for (const name of DEFAULT_KEYS) {
    if (merged[name] === undefined && defaults[name] !== undefined) {
      merged[name] = defaults[name];
    }
  }
  const { gap, ...rest } = merged as P;
  if (gap === undefined || gap <= 0) return rest;
  const edges: Record<Edge, EdgeMode> = { ...edgeModes(rest.edges) };
  for (const edge of EDGES) {
    if (edges[edge] === 'additive') edges[edge] = 'maximum';
  }
  return { ...rest, edges, spacing: Math.max(rest.spacing ?? 0, gap) };
}
