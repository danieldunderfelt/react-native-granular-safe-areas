import { checkDiagnostics } from '../diagnosticsCheck';
import {
  detectMetricsFallback,
  resetDevWarnings,
  warnGranularUnavailable,
} from '../fallback';
import { fixtures } from '../fixtures';
import { metricsFromInsets } from '../geometry';
import type { GranularSafeAreaMetrics } from '../types';

/** Real physical iPhone Duo (`iPhone19,4`, iOS 27.2) diagnostics captured on the HeaderItems screen. */
function duoHeaderItemsDiagnostics() {
  const metrics: GranularSafeAreaMetrics = {
    ...fixtures.iPhoneDuoOuterPortrait,
    idiom: 'phone',
    horizontalSizeClass: 'compact',
    systemBars: [
      { x: 0, y: 24, width: 466, height: 58, owner: 1 },
      { x: 394, y: 174, width: 48, height: 48, owner: 4 },
      { x: 394, y: 234, width: 48, height: 100, owner: 5 },
    ],
    barContainersVisible: true,
    barItemsKnown: true,
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
              classes: ['RNSNavigationBar', 'UINavigationBar'],
              frame: { x: 0, y: 24, width: 466, height: 58 },
              visible: true,
            },
            {
              classes: [
                '_TtC5UIKitP33_F83AB3ECBB2C378B4FCEB681A4D7DB7430UIPlatformGlassInteractionView',
                'UIKit.UICoreGraphicsView',
              ],
              frame: { x: 394, y: 174, width: 48, height: 48 },
              visible: true,
            },
            {
              classes: [
                '_TtC5UIKitP33_F83AB3ECBB2C378B4FCEB681A4D7DB7430UIPlatformGlassInteractionView',
                'UIKit.UICoreGraphicsView',
              ],
              frame: { x: 394, y: 234, width: 48, height: 100 },
              visible: true,
            },
          ],
        },
        viewControllers: {
          class: 'ExpoModulesCore.ExpoRootViewController',
          children: [{ class: 'RNSNavigationController', children: [] }],
        },
        viewsNearEdges: [
          {
            alpha: 1,
            classes: ['_UIFloatingBarContainerView'],
            depth: 9,
            frame: { x: 0, y: 0, width: 466, height: 678 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: [
              '_TtC5UIKitP33_F83AB3ECBB2C378B4FCEB681A4D7DB7430UIPlatformGlassInteractionView',
            ],
            depth: 14,
            frame: { x: 394, y: 174, width: 48, height: 48 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: ['_UIButtonBarButton', 'UIControl'],
            depth: 18,
            frame: { x: 399, y: 179, width: 38, height: 38 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: [
              '_TtC5UIKitP33_F83AB3ECBB2C378B4FCEB681A4D7DB7430UIPlatformGlassInteractionView',
            ],
            depth: 14,
            frame: { x: 394, y: 234, width: 48, height: 100 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: ['_UIButtonBarButton', 'UIControl'],
            depth: 18,
            frame: { x: 399, y: 239, width: 38, height: 38 },
            isBar: false,
          },
        ],
      },
      {
        class: 'UITextEffectsWindow',
        isKey: false,
        hidden: false,
        frame: { x: 0, y: 0, width: 466, height: 678 },
      },
    ],
  };
}

/** Real physical iPhone Duo (`iPhone19,4`, iOS 27.2) diagnostics captured on the Tabs screen. */
function duoTabsDiagnostics() {
  const metrics: GranularSafeAreaMetrics = {
    ...fixtures.iPhoneDuoOuterPortraitWithTabBar,
    idiom: 'phone',
    horizontalSizeClass: 'compact',
    systemBars: [{ x: 394, y: 492, width: 48, height: 162, owner: 8 }],
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
              classes: [
                '_TtC5UIKitP33_F83AB3ECBB2C378B4FCEB681A4D7DB7430UIPlatformGlassInteractionView',
                'UIKit.UICoreGraphicsView',
              ],
              frame: { x: 394, y: 492, width: 48, height: 162 },
              visible: true,
            },
          ],
        },
        viewControllers: {
          class: 'ExpoModulesCore.ExpoRootViewController',
          children: [
            {
              class: 'RNSNavigationController',
              children: [
                {
                  class: 'RNSScreen',
                  children: [{ class: 'RNSTabBarController', children: [] }],
                },
              ],
            },
          ],
        },
        viewsNearEdges: [
          {
            alpha: 1,
            classes: ['_UIFloatingBarContainerView'],
            depth: 17,
            frame: { x: 0, y: 0, width: 466, height: 678 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: [
              '_TtC5UIKitP33_F83AB3ECBB2C378B4FCEB681A4D7DB7430UIPlatformGlassInteractionView',
            ],
            depth: 22,
            frame: { x: 394, y: 492, width: 48, height: 162 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: ['UIKit._UITabBarItemPlatterView'],
            depth: 27,
            frame: { x: 394, y: 492, width: 48, height: 162 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: ['_UITabButton', 'UIControl'],
            depth: 29,
            frame: { x: 396, y: 494, width: 44, height: 58 },
            isBar: false,
          },
          {
            alpha: 1,
            classes: ['UITabBar'],
            depth: 19,
            frame: { x: 397, y: 0, width: 69, height: 678 },
            isBar: true,
          },
        ],
      },
    ],
  };
}

describe('checkDiagnostics', () => {
  it('passes on real iPhone Duo header-items diagnostics', () => {
    const diag = duoHeaderItemsDiagnostics();
    const result = checkDiagnostics(diag, {
      metrics: diag.windows[0]!.metrics,
    });
    expect(result.ok).toBe(true);
    expect(result.platform).toBe('ios');
    expect(result.regions).toHaveLength(5);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('passes on real iPhone Duo native-tabs diagnostics, including Probe wrapper with accessories', () => {
    const native = duoTabsDiagnostics();
    const providerMetrics = native.windows[0]!.metrics!;
    const result = checkDiagnostics({
      providerMetrics,
      regions: [
        {
          kind: 'status',
          edge: 'right',
          frame: { x: 382, y: 0, width: 84, height: 174 },
        },
        {
          kind: 'controls',
          edge: 'right',
          frame: { x: 382, y: 492, width: 84, height: 162 },
          owner: 8,
        },
        {
          kind: 'inset',
          edge: 'bottom',
          frame: { x: 0, y: 644, width: 466, height: 34 },
        },
        // App accessory (negative owner) must not cause a false sync mismatch.
        {
          kind: 'accessory',
          edge: 'bottom',
          frame: { x: 0, y: 564, width: 466, height: 114 },
          owner: -3,
        },
      ],
      native,
    });
    expect(result.ok).toBe(true);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('passes on a plain Duo screen with no UIKit bars', () => {
    const diag = {
      device: { machine: 'iPhone19,4', model: 'iPhone', systemVersion: '27.2' },
      sdk: { iphoneOSVersionMaxAllowed: 270200, hasIOS27_1SDK: 1 },
      windows: [
        {
          class: 'UIWindow',
          isKey: true,
          hidden: false,
          metrics: fixtures.iPhoneDuoOuterPortrait,
          bars: { barItemsKnown: false, containersVisible: false, views: [] },
          viewsNearEdges: [],
        },
      ],
    };
    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(true);
    expect(result.regions.map((r) => r.kind)).toEqual(['status', 'inset']);
  });

  it('fails when visible vertical bar controls in UIKit are missing from controls regions', () => {
    const diag = duoTabsDiagnostics();
    // Simulate the missing-controls symptom: systemBars came back empty while the tab bar is visibly on screen.
    diag.windows[0]!.metrics!.systemBars = [];
    diag.windows[0]!.bars!.views = [];

    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'vertical-bar-controls',
        status: 'fail',
      })
    );
  });

  it('fails when a UITabBarController is visible with a vertical UITabBar and zero column controls', () => {
    const diag = duoTabsDiagnostics();
    diag.windows[0]!.metrics!.systemBars = [];
    diag.windows[0]!.bars!.views = [];
    // Even if glass platter views were absent from viewsNearEdges, the visible UITabBar + TabBarController catches it.
    diag.windows[0]!.viewsNearEdges = [
      {
        alpha: 1,
        classes: ['UITabBar'],
        depth: 19,
        frame: { x: 397, y: 0, width: 69, height: 678 },
        isBar: true,
      },
    ];

    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'vertical-bar-controls',
        status: 'fail',
      })
    );
  });

  it('fails when floating bar containers were not recognized and the column stayed whole', () => {
    const diag = duoTabsDiagnostics();
    diag.windows[0]!.metrics!.systemBars = [];
    diag.windows[0]!.metrics!.barItemsKnown = false;
    diag.windows[0]!.bars!.barItemsKnown = false;
    diag.windows[0]!.bars!.views = [];

    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'floating-bar-container',
        status: 'fail',
      })
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'vertical-bar-refinement',
        status: 'fail',
      })
    );
  });

  it('fails when the live store metrics are stale compared to the key window', () => {
    const diag = duoTabsDiagnostics();
    // Store stuck on launch-time metrics (2 regions: status + inset, no controls).
    const result = checkDiagnostics(diag, {
      metrics: fixtures.iPhoneDuoOuterPortrait,
    });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'metrics-sync',
        status: 'fail',
      })
    );
  });

  it('fails when running on iOS 27.1+ but compiled without the iOS 27.1 SDK', () => {
    const diag = duoHeaderItemsDiagnostics();
    diag.sdk.hasIOS27_1SDK = 0;
    diag.sdk.iphoneOSVersionMaxAllowed = 260000;
    diag.windows[0]!.metrics!.reservedRegionsSupported = false;

    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'ios-sdk', status: 'fail' })
    );
  });

  it('fails when nothing reports where the status cluster ends', () => {
    const diag = duoHeaderItemsDiagnostics();
    diag.windows[0]!.metrics!.barRegionInsets = null;
    diag.windows[0]!.metrics!.statusBar = { x: 0, y: 0, width: 466, height: 2 };

    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'vertical-bar-status', status: 'fail' })
    );
  });

  it('warns when a full-height placeholder UITabBar leaks into bar views', () => {
    const diag = duoTabsDiagnostics();
    diag.windows[0]!.bars!.views.push({
      classes: ['UITabBar'],
      frame: { x: 397, y: 0, width: 69, height: 678 },
      visible: true,
    });

    const result = checkDiagnostics(diag);
    expect(result.ok).toBe(true);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'vertical-bar-controls',
        status: 'warn',
      })
    );
  });

  it('passes on a regular iPhone without a vertical bar', () => {
    const diag = {
      device: { machine: 'iPhone19,2', model: 'iPhone', systemVersion: '27.2' },
      sdk: { iphoneOSVersionMaxAllowed: 270200, hasIOS27_1SDK: 1 },
      windows: [
        {
          class: 'UIWindow',
          isKey: true,
          hidden: false,
          metrics: fixtures.iPhone18ProPortrait,
          bars: { barItemsKnown: false, containersVisible: false, views: [] },
          viewsNearEdges: [],
        },
      ],
    };
    const result = checkDiagnostics(diag, {
      metrics: fixtures.iPhone18ProPortrait,
    });
    expect(result.ok).toBe(true);
    expect(result.regions.map((r) => r.kind)).toEqual(['inset', 'inset']);
  });

  it('checks Android diagnostics and cutout refinement', () => {
    const okDiag = {
      platform: 'android',
      sdk: 37,
      device: 'Google Pixel 10',
      window: { metrics: fixtures.pixel10Landscape },
    };
    const pass = checkDiagnostics(okDiag, {
      metrics: fixtures.pixel10Landscape,
    });
    expect(pass.ok).toBe(true);
    expect(pass.platform).toBe('android');
    expect(pass.checks).toContainEqual(
      expect.objectContaining({ id: 'cutout-refinement', status: 'pass' })
    );

    const missingSources = {
      platform: 'android',
      sdk: 37,
      device: 'Google Pixel 10',
      window: {
        metrics: { ...fixtures.pixel10Landscape, android: undefined },
      },
    };
    const fail = checkDiagnostics(missingSources);
    expect(fail.ok).toBe(false);
    expect(fail.checks).toContainEqual(
      expect.objectContaining({ id: 'android-sources', status: 'fail' })
    );
  });

  it('fails gracefully on null or unrecognized diagnostics', () => {
    expect(checkDiagnostics(null)).toMatchObject({
      ok: false,
      reason: 'no-metrics',
      platform: 'unknown',
      regions: [],
    });
    expect(checkDiagnostics({})).toMatchObject({
      ok: false,
      reason: 'check-failed',
      platform: 'unknown',
      regions: [],
    });
  });

  it('exposes structured reason and device metadata on results', () => {
    const passing = checkDiagnostics(duoHeaderItemsDiagnostics());
    expect(passing.reason).toBeNull();
    expect(passing.device).toMatchObject({
      type: 'foldable',
      posture: 'folded',
      model: 'iPhone19,4',
      systemVersion: '27.2',
      granularSupported: true,
    });

    const missingControls = duoTabsDiagnostics();
    missingControls.windows[0]!.metrics!.systemBars = [];
    missingControls.windows[0]!.bars!.views = [];
    const failing = checkDiagnostics(missingControls);
    expect(failing.reason).toBe('vertical-bar-controls-missing');
    expect(failing.device.granularSupported).toBe(false);
  });
});

describe('detectMetricsFallback and dev warnings', () => {
  const globalDev = globalThis as { __DEV__?: boolean };
  const originalDev = globalDev.__DEV__;

  afterEach(() => {
    resetDevWarnings();
    jest.restoreAllMocks();
    globalDev.__DEV__ = originalDev;
  });

  it('returns null for healthy iOS and Android devices', () => {
    expect(detectMetricsFallback(fixtures.iPhoneDuoOuterPortrait)).toBeNull();
    expect(
      detectMetricsFallback(fixtures.iPhoneDuoOuterPortraitWithTabBar)
    ).toBeNull();
    expect(detectMetricsFallback(fixtures.iPhone18ProPortrait)).toBeNull();
    expect(detectMetricsFallback(fixtures.iPadProWindow)).toBeNull();
    expect(
      detectMetricsFallback({
        ...fixtures.iPadProFullScreen,
        systemVersion: '27.0',
      })
    ).toBeNull();
    expect(detectMetricsFallback(fixtures.pixel10Portrait)).toBeNull();
    expect(detectMetricsFallback(fixtures.pixel10Landscape)).toBeNull();
  });

  it('detects expected non-issue fallbacks on web and older iOS', () => {
    expect(
      detectMetricsFallback(
        metricsFromInsets(
          1024,
          768,
          { top: 0, right: 0, bottom: 0, left: 0 },
          'web'
        )
      )
    ).toMatchObject({ reason: 'platform-unsupported', isIssue: false });

    expect(
      detectMetricsFallback({
        ...fixtures.iPhone18ProPortrait,
        reservedRegionsSupported: false,
        systemVersion: '18.5',
      })
    ).toMatchObject({ reason: 'os-unsupported', isIssue: false });
  });

  it('detects actionable iOS and Android fallback failures', () => {
    expect(
      detectMetricsFallback({
        ...fixtures.iPhoneDuoOuterPortrait,
        reservedRegionsSupported: false,
        systemVersion: '27.2',
      })
    ).toMatchObject({ reason: 'ios-sdk-too-old', isIssue: true });

    expect(
      detectMetricsFallback({
        ...fixtures.iPhoneDuoOuterPortrait,
        barRegionInsets: null,
      })
    ).toMatchObject({ reason: 'status-cluster-unknown', isIssue: true });

    expect(
      detectMetricsFallback({
        ...fixtures.iPhoneDuoOuterPortraitWithTabBar,
        systemBars: [],
        barItemsKnown: false,
      })
    ).toMatchObject({ reason: 'floating-bar-unrecognized', isIssue: true });

    expect(
      detectMetricsFallback({
        ...fixtures.pixel10Landscape,
        android: undefined,
      })
    ).toMatchObject({ reason: 'android-sources-missing', isIssue: true });

    expect(
      detectMetricsFallback({
        ...fixtures.pixel10Landscape,
        occlusions: [],
      })
    ).toMatchObject({ reason: 'android-cutout-unrefined', isIssue: true });

    expect(
      detectMetricsFallback({
        ...fixtures.pixel10Portrait,
        insets: { top: 42, right: 0, bottom: 0, left: 0 },
        systemBars: [],
        android: {
          bars: { top: 0, right: 0, bottom: 0, left: 0 },
          caption: { top: 42, right: 0, bottom: 0, left: 0 },
          cutout: { top: 0, right: 0, bottom: 0, left: 0 },
          captionTransparent: true,
          corners: [],
        },
      })
    ).toMatchObject({ reason: 'android-caption-unrefined', isIssue: true });
  });

  it('logs deduplicated console warnings only in __DEV__', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    globalDev.__DEV__ = false;
    warnGranularUnavailable('native-unavailable', 'Module missing.');
    expect(warn).not.toHaveBeenCalled();

    globalDev.__DEV__ = true;
    warnGranularUnavailable('native-unavailable', 'Module missing.');
    warnGranularUnavailable('native-unavailable', 'Module missing.');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      'react-native-granular-safe-areas: Module missing. Falling back to band avoidance.'
    );
  });
});
