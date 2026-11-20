import type { GranularSafeAreaStore } from './store';

const stores = new Set<GranularSafeAreaStore>();

/** Keeps track of a store for {@link refreshSafeAreas}. Returns the function that stops. */
export function registerStore(store: GranularSafeAreaStore): () => void {
  stores.add(store);
  return () => {
    stores.delete(store);
  };
}

/**
 * Re-reads the OS UI right away. Changes are picked up on their own, but some only within a second, such as bars
 * appearing after navigation; call this right after your own navigation to pick them up straight away.
 */
export function refreshSafeAreas() {
  for (const store of stores) store.requestRefresh();
}
