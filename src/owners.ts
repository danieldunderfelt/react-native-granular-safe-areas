let nextOwnerId = -1;

/**
 * An id for app UI drawn from JS (an accessory, the vertical bar back button), for the regions it takes. Native views
 * register under it, so other views can tell whether it's drawn on top of them. Negative, so it never collides with
 * the ids the native side gives UIKit bars.
 */
export function createOwnerId(): number {
  return nextOwnerId--;
}
