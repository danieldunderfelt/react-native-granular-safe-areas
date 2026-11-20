import type { HostInstance } from 'react-native';

/* eslint-disable no-bitwise -- compareDocumentPosition returns a bit mask */
type OrderedNode = { compareDocumentPosition(other: OrderedNode): number };
const FOLLOWING = 4;
const RELATED = 8 | 16;

function isOrdered(node: unknown): node is OrderedNode {
  return (
    typeof (node as Partial<OrderedNode> | null)?.compareDocumentPosition ===
    'function'
  );
}

/**
 * Whether `view` is drawn on top of `other`, from the order of the tree (React Native's elements and the DOM both
 * have `compareDocumentPosition`): it comes later, without containing `other` or being inside it. zIndex isn't taken
 * into account. Used where the native side can't say: before a view's first native measurement, and on the web.
 * Assumed to be when there's no way to tell.
 */
export function isDrawnAbove(view: HostInstance, other: HostInstance): boolean {
  if (!isOrdered(view) || !isOrdered(other)) return true;
  const position = other.compareDocumentPosition(view);
  return (position & FOLLOWING) !== 0 && (position & RELATED) === 0;
}

/** Whether one of the two contains the other. Assumed not to when there's no way to tell. */
export function areRelated(view: HostInstance, other: HostInstance): boolean {
  if (!isOrdered(view) || !isOrdered(other)) return false;
  return (other.compareDocumentPosition(view) & RELATED) !== 0;
}
/* eslint-enable no-bitwise */
