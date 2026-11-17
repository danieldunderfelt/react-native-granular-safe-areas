import { regionsEqual } from './geometry';
import type { GranularSafeAreaMetrics, Rect, SafeAreaRegion } from './types';

export type GranularSafeAreaSnapshot = {
  /** The regions to avoid, in the provider's coordinate space. */
  regions: readonly SafeAreaRegion[];
  /** The raw platform metrics the regions were built from. `null` until the provider has been measured. */
  metrics: GranularSafeAreaMetrics | null;
  /** Bumped whenever elements need to recompute: new regions, or the provider itself moved or resized. */
  version: number;
};

/**
 * A provider's regions, kept outside React state. Consumers subscribe and recompute their own insets, so an element
 * re-renders only when its insets actually change, and a provider update never re-renders the tree below it.
 */
export class GranularSafeAreaStore {
  private snapshot: GranularSafeAreaSnapshot = {
    regions: [],
    metrics: null,
    version: 0,
  };
  private readonly listeners = new Set<() => void>();
  private providerRect: { version: number; rect: Rect | null } | null = null;
  private refreshScheduled = false;

  constructor(
    private readonly measureProvider: () => Rect | null,
    private readonly refreshNative: () => void
  ) {}

  getSnapshot = (): GranularSafeAreaSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The provider's rectangle in the root view. Measured at most once per version, however many elements ask. */
  getProviderRect(): Rect | null {
    if (this.providerRect?.version !== this.snapshot.version) {
      this.providerRect = {
        version: this.snapshot.version,
        rect: this.measureProvider(),
      };
    }
    return this.providerRect.rect;
  }

  /** Publishes new regions. Subscribers only run if the regions or the metrics actually changed. */
  publish(
    regions: readonly SafeAreaRegion[],
    metrics: GranularSafeAreaMetrics | null
  ) {
    const previous = this.snapshot;
    if (
      regionsEqual(previous.regions, regions) &&
      JSON.stringify(previous.metrics) === JSON.stringify(metrics)
    ) {
      return;
    }
    this.snapshot = { regions, metrics, version: previous.version + 1 };
    this.notify();
  }

  /** The provider moved or resized: elements must measure again even though the regions are the same. */
  invalidateLayout() {
    this.snapshot = { ...this.snapshot, version: this.snapshot.version + 1 };
    this.notify();
  }

  /** Asks the native side to re-read the system UI. Calls in the same tick are coalesced into one. */
  requestRefresh = () => {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    setTimeout(() => {
      this.refreshScheduled = false;
      this.refreshNative();
    }, 0);
  };

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}
