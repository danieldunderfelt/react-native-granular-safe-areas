let mockPlatformOS: 'ios' | 'android' | 'web' = 'ios';
let mockAppState: 'active' | 'background' | 'inactive' = 'active';
const mockAppStateListeners = new Set<(state: string) => void>();

let mockNativeAvailable = true;
let mockGetDiagnosticsJSON: () => Promise<string | null> = () =>
  Promise.resolve(null);

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
  AppState: {
    get currentState() {
      return mockAppState;
    },
    addEventListener: (_type: string, listener: (state: string) => void) => {
      mockAppStateListeners.add(listener);
      return {
        remove: () => {
          mockAppStateListeners.delete(listener);
        },
      };
    },
  },
}));

jest.mock('../nativeBridge', () => ({
  get isNativeModuleAvailable() {
    return mockNativeAvailable;
  },
  getDiagnosticsJSON: () => mockGetDiagnosticsJSON(),
}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GranularSafeAreaContext } from '../context';
import {
  useSafeAreaDiagnostics,
  type UseSafeAreaDiagnosticsOptions,
  type UseSafeAreaDiagnosticsResult,
} from '../diagnosticsHook';
import { resetDevWarnings } from '../fallback';
import { fixtures } from '../fixtures';
import { buildRegions } from '../geometry';
import { GranularSafeAreaStore } from '../store';

const consoleError = console.error;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const globalDev = globalThis as { __DEV__?: boolean };
const originalDev = globalDev.__DEV__;
const mounted: ReactTestRenderer[] = [];

function healthyDuoDiagnostics() {
  const metrics = {
    ...fixtures.iPhoneDuoOuterPortraitWithTabBar,
    deviceModel: 'iPhone19,4',
    systemVersion: '27.2',
  };
  return {
    library: 'react-native-granular-safe-areas',
    device: { machine: 'iPhone19,4', model: 'iPhone', systemVersion: '27.2' },
    sdk: { iphoneOSVersionMaxAllowed: 270200, hasIOS27_1SDK: 1 },
    windows: [
      {
        class: 'UIWindow',
        isKey: true,
        hidden: false,
        frame: { x: 0, y: 0, width: 466, height: 678 },
        safeAreaInsets: { top: 0, right: 84, bottom: 34, left: 0 },
        metrics,
        bars: {
          barItemsKnown: true,
          containersVisible: true,
          views: [
            {
              classes: ['UIPlatformGlassInteractionView'],
              frame: { x: 394, y: 492, width: 48, height: 162 },
              visible: true,
            },
          ],
        },
        viewControllers: {
          class: 'RNSTabBarController',
          children: [],
        },
        viewsNearEdges: [
          {
            alpha: 1,
            classes: ['UIPlatformGlassInteractionView'],
            depth: 12,
            frame: { x: 394, y: 492, width: 48, height: 162 },
            isBar: false,
          },
        ],
      },
    ],
  };
}

function brokenDuoDiagnostics() {
  const diag = healthyDuoDiagnostics();
  // Simulate the physical Duo failure: visible glass tab bar in UIKit, but systemBars empty.
  diag.windows[0]!.metrics.systemBars = [];
  diag.windows[0]!.bars.views = [];
  return diag;
}

function makeStore(metrics = healthyDuoDiagnostics().windows[0]!.metrics) {
  const store = new GranularSafeAreaStore(
    () => ({ x: 0, y: 0, width: 466, height: 678 }),
    () => {}
  );
  store.publish(
    buildRegions(metrics),
    metrics,
    buildRegions(metrics, { granular: false })
  );
  return store;
}

function renderHook(
  store: GranularSafeAreaStore,
  options?: UseSafeAreaDiagnosticsOptions
) {
  let latest!: UseSafeAreaDiagnosticsResult;
  function Harness({ opts }: { opts?: UseSafeAreaDiagnosticsOptions }) {
    latest = useSafeAreaDiagnostics(opts);
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <GranularSafeAreaContext.Provider value={store}>
        <Harness opts={options} />
      </GranularSafeAreaContext.Provider>
    );
  });
  mounted.push(renderer);
  return {
    get current() {
      return latest;
    },
    update(nextOptions?: UseSafeAreaDiagnosticsOptions) {
      act(() => {
        renderer.update(
          <GranularSafeAreaContext.Provider value={store}>
            <Harness opts={nextOptions} />
          </GranularSafeAreaContext.Provider>
        );
      });
    },
    unmount() {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
  mockPlatformOS = 'ios';
  mockAppState = 'active';
  mockNativeAvailable = true;
  mockGetDiagnosticsJSON = () => Promise.resolve(null);
  mockAppStateListeners.clear();
  resetDevWarnings();
  globalDev.__DEV__ = true;
});

afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  jest.useRealTimers();
  jest.restoreAllMocks();
  globalDev.__DEV__ = originalDev;
});

describe('useSafeAreaDiagnostics', () => {
  it('passes silently when native diagnostics are healthy', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const diag = healthyDuoDiagnostics();
    mockGetDiagnosticsJSON = () => Promise.resolve(JSON.stringify(diag));
    const store = makeStore(diag.windows[0]!.metrics);
    const onIssue = jest.fn();
    const onCheck = jest.fn();

    const hook = renderHook(store, { onIssue, onCheck, delayMs: 200 });
    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(hook.current.report?.ok).toBe(true);
    expect(hook.current.report?.reason).toBeNull();
    expect(hook.current.fallbackActive).toBe(false);
    expect(onIssue).not.toHaveBeenCalled();
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to whole bands, warns in __DEV__, and reports to onIssue when bar controls are missing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const diag = brokenDuoDiagnostics();
    mockGetDiagnosticsJSON = () => Promise.resolve(JSON.stringify(diag));
    const store = makeStore(diag.windows[0]!.metrics);
    const onIssue = jest.fn();

    // Initially the store has refined granular status (right edge) + bottom inset.
    expect(store.getSnapshot().regions.map((r) => r.kind)).toEqual([
      'status',
      'inset',
    ]);

    const hook = renderHook(store, { onIssue, delayMs: 100 });
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    // Store switched to whole-band avoidance so content clears the entire right column.
    expect(hook.current.fallbackActive).toBe(true);
    expect(store.getSnapshot().fallbackToBands).toBe(true);
    expect(store.getSnapshot().regions.map((r) => r.kind)).toEqual([
      'inset',
      'inset',
    ]);
    expect(store.getSnapshot().device.granularSupported).toBe(false);

    // Structured Datadog-friendly report sent once without heavy raw diagnostics by default.
    expect(onIssue).toHaveBeenCalledTimes(1);
    const report = onIssue.mock.calls[0]![0];
    expect(report).toMatchObject({
      ok: false,
      reason: 'vertical-bar-controls-missing',
      platform: 'ios',
      fallbackToBands: true,
      device: {
        type: 'foldable',
        posture: 'folded',
        model: 'iPhone19,4',
        systemVersion: '27.2',
        granularSupported: false,
      },
    });
    expect(report.failedChecks).toHaveLength(1);
    expect(report.failedChecks[0]!.id).toBe('vertical-bar-controls');
    expect('diagnostics' in report).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('Falling back to band avoidance.');
  });

  it('deduplicates repeated onIssue reports on foregrounding, and recovers when a later check passes', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = brokenDuoDiagnostics();
    const healthy = healthyDuoDiagnostics();
    let current = broken;
    mockGetDiagnosticsJSON = () => Promise.resolve(JSON.stringify(current));
    const store = makeStore(broken.windows[0]!.metrics);
    const onIssue = jest.fn();

    const hook = renderHook(store, { onIssue, delayMs: 50 });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(hook.current.fallbackActive).toBe(true);

    // Foreground again with the same failure -> deduplicated.
    await act(async () => {
      mockAppState = 'background';
      mockAppStateListeners.forEach((l) => l('background'));
      mockAppState = 'active';
      mockAppStateListeners.forEach((l) => l('active'));
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    expect(onIssue).toHaveBeenCalledTimes(1);

    // Device recovers -> store publishes updated metrics and diagnostics pass -> granular restored.
    current = healthy;
    act(() => {
      store.publish(
        buildRegions(healthy.windows[0]!.metrics),
        healthy.windows[0]!.metrics,
        buildRegions(healthy.windows[0]!.metrics, { granular: false })
      );
    });
    await act(async () => {
      await hook.current.checkNow();
    });
    expect(hook.current.report?.ok).toBe(true);
    expect(hook.current.fallbackActive).toBe(false);
    expect(store.getSnapshot().regions.map((r) => r.kind)).toEqual([
      'status',
      'controls',
      'inset',
    ]);
  });

  it('respects fallbackToBands: false, deduplicate: false, and includeDiagnostics: true', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = brokenDuoDiagnostics();
    mockGetDiagnosticsJSON = () => Promise.resolve(JSON.stringify(broken));
    const store = makeStore(broken.windows[0]!.metrics);
    const onIssue = jest.fn();

    const hook = renderHook(store, {
      onIssue,
      fallbackToBands: false,
      deduplicate: false,
      includeDiagnostics: true,
      delayMs: 50,
    });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    await act(async () => {
      await hook.current.checkNow();
    });

    expect(store.getSnapshot().fallbackToBands).toBe(false);
    expect(onIssue).toHaveBeenCalledTimes(2);
    expect(onIssue.mock.calls[0]![0].diagnostics).toEqual(broken);
  });

  it('reports native-unavailable when the native module is not linked on iOS/Android', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNativeAvailable = false;
    const store = makeStore();
    const onIssue = jest.fn();

    const hook = renderHook(store, { onIssue, delayMs: 50 });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(hook.current.report?.ok).toBe(false);
    expect(hook.current.report?.reason).toBe('native-unavailable');
    expect(hook.current.fallbackActive).toBe(true);
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not fire onIssue on web or for mocked providers', async () => {
    const onIssue = jest.fn();
    mockPlatformOS = 'web';
    mockNativeAvailable = false;
    const store = makeStore();

    const webHook = renderHook(store, { onIssue, delayMs: 50 });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    expect(webHook.current.report?.ok).toBe(true);
    expect(onIssue).not.toHaveBeenCalled();

    // Mocked provider on iOS
    mockPlatformOS = 'ios';
    mockNativeAvailable = true;
    const mockedStore = makeStore();
    mockedStore.setMocked(true);
    const mockedHook = renderHook(mockedStore, { onIssue, delayMs: 50 });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    expect(mockedHook.current.report?.ok).toBe(true);
    expect(onIssue).not.toHaveBeenCalled();
  });

  it('clears forced band fallback on unmount', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = brokenDuoDiagnostics();
    mockGetDiagnosticsJSON = () => Promise.resolve(JSON.stringify(broken));
    const store = makeStore(broken.windows[0]!.metrics);

    const hook = renderHook(store, { delayMs: 50 });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    expect(store.getSnapshot().fallbackToBands).toBe(true);

    hook.unmount();
    expect(store.getSnapshot().fallbackToBands).toBe(false);
  });
});
