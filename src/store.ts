import {
  getSystemControls,
  getVerticalBar,
  rectsEqual,
  regionsEqual,
  verticalBarBackButtonFrame,
  type SystemControls,
} from './geometry';
import type { HostInstance } from 'react-native';
import { createOwnerId } from './owners';
import type { GranularSafeAreaMetrics, Rect, SafeAreaRegion } from './types';

/** Which symbol a vertical bar back button shows: a back chevron, or a close cross for modals and sheets. */
export type BackButtonIcon = 'back' | 'close';

/** The back button the provider shows in the vertical bar. */
export type BackButtonState = {
  /** Where it is, in the provider's coordinates. */
  frame: Rect;
  icon: BackButtonIcon;
  accessibilityLabel: string;
  /** The registration it belongs to. */
  owner: number;
};

export type GranularSafeAreaSnapshot = {
  /** The regions to avoid, in the provider's coordinate space. Includes the vertical bar back button when shown. */
  regions: readonly SafeAreaRegion[];
  /** The same with every inset band whole, as a regular safe area has them. What views avoid by default. */
  bands: readonly SafeAreaRegion[];
  /** The raw platform metrics the regions were built from. `null` until the provider has been measured. */
  metrics: GranularSafeAreaMetrics | null;
  /** The strip where the system puts its controls (the iPhone Duo's vertical bar), including the back button. */
  systemControls: SystemControls | null;
  /** The back button shown in the vertical bar, if any. */
  backButton: BackButtonState | null;
  /** Bumped whenever elements need to recompute: new regions, or the provider itself moved or resized. */
  version: number;
};

export type BackButtonRegistration = {
  onPress: () => unknown;
  icon: BackButtonIcon;
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
    bands: [],
    metrics: null,
    systemControls: null,
    backButton: null,
    version: 0,
  };
  private baseRegions: readonly SafeAreaRegion[] = [];
  private baseBands: readonly SafeAreaRegion[] = [];
  private readonly accessories = new Map<number, SafeAreaRegion>();
  private readonly accessoryNodes = new Map<number, HostInstance>();
  /** The owner id of the vertical bar back button's region: the button view registers under it natively. */
  readonly backButtonOwnerId = createOwnerId();
  private readonly listeners = new Set<() => unknown>();
  private providerRect: { version: number; rect: Rect | null } | null = null;
  private refreshScheduled = false;
  private readonly backButtons = new Map<number, Registration>();
  private nextId = 1;
  private nextOrder = 1;

  constructor(
    private readonly measureProvider: () => Rect | null,
    private readonly refreshNative: () => unknown,
    /** The provider's host view. */
    readonly getProviderNode: () => HostInstance | null = () => null
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

  /**
   * Publishes new regions, and the same with whole bands (the regions themselves when they aren't broken down).
   * Subscribers only run if something they can see actually changed.
   */
  publish(
    regions: readonly SafeAreaRegion[],
    metrics: GranularSafeAreaMetrics | null,
    bands: readonly SafeAreaRegion[] = regions
  ) {
    this.baseRegions = regions;
    this.baseBands = bands;
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

  /**
   * Adds, moves or (with `null`) removes the region of an accessory: app UI floating over the content, which other
   * views avoid when it's drawn on top of them.
   */
  setAccessory(owner: number, region: SafeAreaRegion | null) {
    const current = this.accessories.get(owner);
    if (
      region === null ? !current : current && regionsEqual([current], [region])
    )
      return;
    if (region) this.accessories.set(owner, region);
    else this.accessories.delete(owner);
    this.update(this.snapshot.metrics);
  }

  /** The web: an accessory's element, to tell from the document order whether it's drawn on top of another one. */
  setAccessoryNode(owner: number, node: HostInstance | null) {
    if (node) this.accessoryNodes.set(owner, node);
    else this.accessoryNodes.delete(owner);
  }

  getAccessoryNode(owner: number): HostInstance | undefined {
    return this.accessoryNodes.get(owner);
  }

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
    const backButton: BackButtonState | null =
      frame && active
        ? {
            frame,
            icon: active[1].icon,
            accessibilityLabel: active[1].accessibilityLabel,
            owner: active[0],
          }
        : null;

    // The button is drawn over the column, so everything else avoids it like the bar items UIKit draws there.
    const backButtonRegions: SafeAreaRegion[] =
      backButton && verticalBar
        ? [
            {
              kind: 'controls',
              edge: verticalBar.edge,
              frame: {
                x: verticalBar.column.x,
                y: backButton.frame.y,
                width: verticalBar.column.width,
                height: backButton.frame.height,
              },
              owner: this.backButtonOwnerId,
            },
          ]
        : [];
    // Accessories float over the content anywhere, never inside a band, so they're in both lists.
    const accessories = [...this.accessories.values()];
    const regions =
      backButtonRegions.length + accessories.length > 0
        ? [...this.baseRegions, ...backButtonRegions, ...accessories]
        : this.baseRegions;
    const bands =
      accessories.length > 0
        ? [...this.baseBands, ...accessories]
        : this.baseBands;

    const regionsChanged = !regionsEqual(previous.regions, regions);
    const bandsChanged = !regionsEqual(previous.bands, bands);
    const metricsChanged =
      JSON.stringify(previous.metrics) !== JSON.stringify(metrics);
    if (
      !regionsChanged &&
      !bandsChanged &&
      !metricsChanged &&
      backButtonsEqual(previous.backButton, backButton)
    ) {
      return;
    }
    this.snapshot = {
      regions: regionsChanged ? regions : previous.regions,
      bands: bandsChanged ? bands : previous.bands,
      metrics,
      systemControls:
        metricsChanged || regionsChanged
          ? metrics
            ? getSystemControls(metrics, backButton ? [backButton.frame] : [])
            : null
          : previous.systemControls,
      backButton: backButtonsEqual(previous.backButton, backButton)
        ? previous.backButton
        : backButton,
      version:
        regionsChanged || bandsChanged || metricsChanged
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
  a: BackButtonState | null,
  b: BackButtonState | null
) {
  if (!a || !b) return a === b;
  return (
    a.owner === b.owner &&
    a.icon === b.icon &&
    a.accessibilityLabel === b.accessibilityLabel &&
    rectsEqual(a.frame, b.frame)
  );
}
