import {
  getVerticalBar,
  rectsEqual,
  regionsEqual,
  verticalBarBackButtonFrame,
  type VerticalBar,
} from './geometry';
import type { GranularSafeAreaMetrics, Rect, SafeAreaRegion } from './types';

/** Which symbol a vertical bar back button shows: a back chevron, or a close cross for modals and sheets. */
export type VerticalBarBackButtonIcon = 'back' | 'close';

/** The back button the provider shows in the vertical bar. */
export type VerticalBarBackButtonState = {
  /** Where it is, in the provider's coordinates. */
  frame: Rect;
  icon: VerticalBarBackButtonIcon;
  accessibilityLabel: string;
  /** The registration it belongs to. */
  owner: number;
};

export type GranularSafeAreaSnapshot = {
  /** The regions to avoid, in the provider's coordinate space. Includes the vertical bar back button when shown. */
  regions: readonly SafeAreaRegion[];
  /** The raw platform metrics the regions were built from. `null` until the provider has been measured. */
  metrics: GranularSafeAreaMetrics | null;
  /** The system's vertical bar where this provider is, if there is one. */
  verticalBar: VerticalBar | null;
  /** The back button shown in the vertical bar, if any. */
  backButton: VerticalBarBackButtonState | null;
  /** Bumped whenever elements need to recompute: new regions, or the provider itself moved or resized. */
  version: number;
};

export type BackButtonRegistration = {
  onPress: () => unknown;
  icon: VerticalBarBackButtonIcon;
  accessibilityLabel: string;
  /** Turned off by the app, e.g. while the screen isn't focused. */
  enabled: boolean;
  /** Whether the screen the button belongs to is in the window. Off-screen screens of a stack or tabs are not. */
  inWindow: boolean;
};

type Registration = BackButtonRegistration & { order: number };

/**
 * A provider's regions, kept outside React state. Consumers subscribe and recompute their own insets, so an element
 * re-renders only when its insets actually change, and a provider update never re-renders the tree below it.
 */
export class GranularSafeAreaStore {
  private snapshot: GranularSafeAreaSnapshot = {
    regions: [],
    metrics: null,
    verticalBar: null,
    backButton: null,
    version: 0,
  };
  private baseRegions: readonly SafeAreaRegion[] = [];
  private readonly listeners = new Set<() => unknown>();
  private providerRect: { version: number; rect: Rect | null } | null = null;
  private refreshScheduled = false;
  private readonly backButtons = new Map<number, Registration>();
  private nextId = 1;
  private nextOrder = 1;

  constructor(
    private readonly measureProvider: () => Rect | null,
    private readonly refreshNative: () => unknown
  ) {}

  getSnapshot = (): GranularSafeAreaSnapshot => this.snapshot;

  subscribe = (listener: () => unknown): (() => void) => {
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

  /** Publishes new regions. Subscribers only run if something they can see actually changed. */
  publish(
    regions: readonly SafeAreaRegion[],
    metrics: GranularSafeAreaMetrics | null
  ) {
    this.baseRegions = regions;
    this.update(metrics);
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

  /** A new id for {@link registerBackButton}. Taken up front so a component knows its id while it first renders. */
  createBackButtonId(): number {
    return this.nextId++;
  }

  /** Offers a back button for the vertical bar. The most recently registered one that is enabled and in the window wins. */
  registerBackButton(id: number, registration: BackButtonRegistration) {
    this.backButtons.set(id, { ...registration, order: this.nextOrder++ });
    this.update(this.snapshot.metrics);
  }

  updateBackButton(id: number, patch: Partial<BackButtonRegistration>) {
    const current = this.backButtons.get(id);
    if (!current) return;
    this.backButtons.set(id, { ...current, ...patch });
    this.update(this.snapshot.metrics);
  }

  unregisterBackButton(id: number) {
    if (this.backButtons.delete(id)) this.update(this.snapshot.metrics);
  }

  /** Runs the press handler of the back button currently shown. */
  pressBackButton = () => {
    const owner = this.snapshot.backButton?.owner;
    if (owner !== undefined) this.backButtons.get(owner)?.onPress();
  };

  private activeBackButton(): [number, Registration] | null {
    let active: [number, Registration] | null = null;
    for (const entry of this.backButtons) {
      const [, registration] = entry;
      if (!registration.enabled || !registration.inWindow) continue;
      if (!active || registration.order > active[1].order) active = entry;
    }
    return active;
  }

  private update(metrics: GranularSafeAreaMetrics | null) {
    const previous = this.snapshot;
    const verticalBar = metrics ? getVerticalBar(metrics) : null;
    const active = this.activeBackButton();
    const frame =
      verticalBar && active ? verticalBarBackButtonFrame(verticalBar) : null;
    const backButton: VerticalBarBackButtonState | null =
      frame && active
        ? {
            frame,
            icon: active[1].icon,
            accessibilityLabel: active[1].accessibilityLabel,
            owner: active[0],
          }
        : null;

    // The button is drawn over the column, so everything else avoids it like the bar items UIKit draws there.
    const regions =
      backButton && verticalBar
        ? [
            ...this.baseRegions,
            {
              kind: 'systemBar' as const,
              edge: verticalBar.edge,
              frame: {
                x: verticalBar.column.x,
                y: backButton.frame.y,
                width: verticalBar.column.width,
                height: backButton.frame.height,
              },
            },
          ]
        : this.baseRegions;

    const regionsChanged = !regionsEqual(previous.regions, regions);
    const metricsChanged =
      JSON.stringify(previous.metrics) !== JSON.stringify(metrics);
    if (
      !regionsChanged &&
      !metricsChanged &&
      backButtonsEqual(previous.backButton, backButton)
    ) {
      return;
    }
    this.snapshot = {
      regions: regionsChanged ? regions : previous.regions,
      metrics,
      verticalBar:
        metricsChanged || regionsChanged ? verticalBar : previous.verticalBar,
      backButton: backButtonsEqual(previous.backButton, backButton)
        ? previous.backButton
        : backButton,
      version:
        regionsChanged || metricsChanged
          ? previous.version + 1
          : previous.version,
    };
    this.notify();
  }

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}

function backButtonsEqual(
  a: VerticalBarBackButtonState | null,
  b: VerticalBarBackButtonState | null
) {
  if (!a || !b) return a === b;
  return (
    a.owner === b.owner &&
    a.icon === b.icon &&
    a.accessibilityLabel === b.accessibilityLabel &&
    rectsEqual(a.frame, b.frame)
  );
}
