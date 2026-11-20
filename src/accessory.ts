import { nearestEdge } from './geometry';
import type { GranularSafeAreaStore } from './store';
import type { Edge, Rect, SafeAreaRegion } from './types';

/** What a `SafeAreaAccessory` adds to a `SafeAreaView`: the owner id its region carries, and the edge it belongs to. */
export type AccessoryOptions = { owner: number; edge: Edge | undefined };

/** The region an accessory drawn at `frame` (in the provider's coordinates) takes. */
export function accessoryRegion(
  store: GranularSafeAreaStore,
  accessory: AccessoryOptions,
  frame: Rect
): SafeAreaRegion {
  const metrics = store.getSnapshot().metrics;
  return {
    kind: 'accessory',
    edge: accessory.edge ?? (metrics ? nearestEdge(frame, metrics) : 'bottom'),
    frame,
    owner: accessory.owner,
  };
}
