import type { GranularSafeAreaMetrics } from './types';

/**
 * Recorded metrics for previews and tests. Pass one to `<GranularSafeAreaProvider mock={...}>` to lay out for a device
 * you don't have, including on the web.
 *
 * The iPhone Duo closed (outer display) values were recorded on the iPhone Duo simulator (iOS 27.2). Values not marked
 * as recorded are estimates.
 */

const base = {
  platform: 'ios',
  layoutDirection: 'ltr',
  statusBar: null,
  barRegionInsets: null,
  occlusions: [],
  divisions: [],
  systemBars: [],
  barContainersVisible: false,
  barItemsKnown: false,
} satisfies Partial<GranularSafeAreaMetrics>;

/**
 * iPhone Duo, closed (outer display), portrait, in an app without UIKit bars (JavaScript navigation, or native screens
 * with their headers hidden). Recorded.
 */
const iPhoneDuoOuterPortrait: GranularSafeAreaMetrics = {
  ...base,
  width: 466,
  height: 678,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  verticalBarEdge: 'trailing',
  occlusions: [
    // The camera.
    {
      x: 399.6666666666667,
      y: 29.333333333333332,
      width: 37,
      height: 37,
      active: true,
    },
    // The whole status cluster: camera, Dynamic Island, time and signal.
    { x: 382, y: 0, width: 84, height: 174, active: true },
  ],
  // What UIKit reports for a vertical status bar: a placeholder at the top, not where the time and signal are.
  statusBar: { x: 0, y: 0, width: 466, height: 2 },
  // Bar items start right below the status cluster, centered on the camera (x 418) rather than on the column (x 424).
  barRegionInsets: { top: 174, right: 6, bottom: 34, left: 376 },
  reservedRegionsSupported: true,
};

/** iPhone Duo, closed, portrait, with a native tab bar in the vertical bar (react-native-screens native tabs). Recorded. */
const iPhoneDuoOuterPortraitWithTabBar: GranularSafeAreaMetrics = {
  ...iPhoneDuoOuterPortrait,
  // The tab bar platter: three tabs.
  systemBars: [{ x: 394, y: 492, width: 48, height: 162 }],
  barContainersVisible: true,
  barItemsKnown: true,
};

/**
 * iPhone Duo, closed, portrait, in a native stack screen with a header: the navigation bar across the top, and the
 * back button in the vertical bar right below the status cluster. Recorded.
 */
const iPhoneDuoOuterPortraitWithNativeHeader: GranularSafeAreaMetrics = {
  ...iPhoneDuoOuterPortrait,
  systemBars: [
    { x: 0, y: 24, width: 466, height: 58 },
    { x: 394, y: 174, width: 48, height: 48 },
  ],
  barContainersVisible: true,
  barItemsKnown: true,
};

/**
 * iPhone Duo, closed, landscape: the vertical bar is on the left, where the camera is, and the status bar is hidden,
 * so the cluster is only the camera. Recorded with a native header: its back button is below the camera.
 */
const iPhoneDuoOuterLandscape: GranularSafeAreaMetrics = {
  ...base,
  width: 678,
  height: 466,
  insets: { top: 0, right: 0, bottom: 34, left: 84 },
  verticalBarEdge: 'leading',
  occlusions: [
    {
      x: 29.333333333333332,
      y: 29.333333333333314,
      width: 37,
      height: 37,
      active: true,
    },
    { x: 0, y: 0, width: 84, height: 82, active: true },
  ],
  statusBar: null,
  barRegionInsets: { top: 82, right: 588, bottom: 34, left: 6 },
  systemBars: [
    { x: 0, y: 24, width: 678, height: 58 },
    { x: 24, y: 82, width: 48, height: 48 },
  ],
  barContainersVisible: true,
  barItemsKnown: true,
  reservedRegionsSupported: true,
};

/**
 * iPhone Duo, open (inner display), landscape, fully open: a vertical bar on the trailing edge with a shorter status
 * cluster, the fold inactive and the inner camera off. Recorded.
 */
const iPhoneDuoInnerLandscape: GranularSafeAreaMetrics = {
  ...base,
  width: 951,
  height: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  verticalBarEdge: 'trailing',
  occlusions: [
    // The inner camera, inactive while it's off.
    { x: 677.3333333333334, y: 21, width: 58, height: 37, active: false },
    // The status cluster: time and signal, no camera.
    { x: 867, y: 0, width: 84, height: 124, active: true },
  ],
  divisions: [{ x: 455.5, y: 0, width: 40, height: 669, active: false }],
  statusBar: { x: 0, y: 0, width: 951, height: 2 },
  barRegionInsets: { top: 124, right: 6, bottom: 34, left: 861 },
  reservedRegionsSupported: true,
};

/** iPhone Duo, inner display, partially folded like a book: the fold divides the display. Recorded. */
const iPhoneDuoInnerBookFold: GranularSafeAreaMetrics = {
  ...iPhoneDuoInnerLandscape,
  divisions: [{ x: 455.5, y: 0, width: 40, height: 669, active: true }],
};

/**
 * iPhone Duo, inner display, portrait: no vertical bar. The status cluster sits in the top right, inside a top inset
 * that also covers the navigation bar's row. Recorded.
 */
const iPhoneDuoInnerPortrait: GranularSafeAreaMetrics = {
  ...base,
  width: 669,
  height: 951,
  insets: { top: 82, right: 0, bottom: 34, left: 0 },
  verticalBarEdge: null,
  occlusions: [
    { x: 21, y: 215.66666666666666, width: 37, height: 58, active: false },
    { x: 525, y: 0, width: 144, height: 82, active: true },
  ],
  divisions: [{ x: 0, y: 455.5, width: 669, height: 40, active: false }],
  statusBar: { x: 0, y: 0, width: 669, height: 2 },
  reservedRegionsSupported: true,
};

/** A regular iPhone with a Dynamic Island, portrait. No vertical bars, so the insets stay whole bands. */
const iPhone18ProPortrait: GranularSafeAreaMetrics = {
  ...base,
  width: 402,
  height: 874,
  insets: { top: 62, right: 0, bottom: 34, left: 0 },
  verticalBarEdge: null,
  occlusions: [{ x: 138, y: 11, width: 126, height: 37, active: true }],
  statusBar: { x: 0, y: 0, width: 402, height: 62 },
  reservedRegionsSupported: true,
};

/**
 * iPad Pro 11-inch in windowed mode, with the window filling the screen, portrait. The window controls are in the
 * status bar then, not over the app, so the insets stay whole bands. Recorded on the iPad simulator (iOS 27.0).
 */
const iPadProFullScreen: GranularSafeAreaMetrics = {
  idiom: 'pad',
  horizontalSizeClass: 'regular',
  ...base,
  width: 834,
  height: 1210,
  insets: { top: 32, right: 0, bottom: 20, left: 0 },
  verticalBarEdge: null,
  statusBar: { x: 0, y: 0, width: 834, height: 32 },
  reservedRegionsSupported: false,
};

/**
 * iPad Pro 11-inch, a window smaller than the screen, in an app without UIKit bars. The window controls are in its
 * top-left corner, over the app: a header level with them moves over, anything taller moves below them. Recorded on
 * the iPad simulator (iOS 27.0).
 */
const iPadProWindow: GranularSafeAreaMetrics = {
  idiom: 'pad',
  horizontalSizeClass: 'compact',
  ...base,
  width: 375,
  height: 617,
  insets: { top: 10, right: 0, bottom: 10, left: 0 },
  verticalBarEdge: null,
  windowControls: { x: 0, y: 0, width: 66, height: 53 },
  reservedRegionsSupported: false,
};

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

/** Pixel 10, portrait, 3-button navigation. Recorded on the Pixel 10 emulator (Android 17, API 37). */
const pixel10Portrait: GranularSafeAreaMetrics = {
  ...base,
  platform: 'android',
  width: 411.429,
  height: 923.429,
  insets: { top: 54.095, right: 0, bottom: 48, left: 0 },
  verticalBarEdge: null,
  statusBar: { x: 0, y: 0, width: 411.429, height: 54.095 },
  occlusions: [
    { x: 184.762, y: 0, width: 41.905, height: 54.095, active: true },
  ],
  reservedRegionsSupported: false,
  android: {
    bars: { top: 54.095, right: 0, bottom: 48, left: 0 },
    caption: ZERO,
    cutout: { top: 54.095, right: 0, bottom: 0, left: 0 },
    captionTransparent: false,
    corners: [
      { x: 0, y: 0, width: 50.286, height: 50.286 },
      { x: 361.143, y: 0, width: 50.286, height: 50.286 },
      { x: 361.143, y: 873.143, width: 50.286, height: 50.286 },
      { x: 0, y: 873.143, width: 50.286, height: 50.286 },
    ],
  },
};

/**
 * Pixel 10 in landscape, the camera on the left: the navigation bar is on the right, so the left band is the display
 * cutout alone, and only the camera and the rounded corners are avoided there. Recorded on the Pixel 10 emulator.
 */
const pixel10Landscape: GranularSafeAreaMetrics = {
  ...base,
  platform: 'android',
  width: 923.429,
  height: 411.429,
  insets: { top: 52.19, right: 48, bottom: 0, left: 54.095 },
  verticalBarEdge: null,
  statusBar: { x: 0, y: 0, width: 923.429, height: 52.19 },
  occlusions: [
    { x: 0, y: 184.762, width: 54.095, height: 41.905, active: true },
  ],
  reservedRegionsSupported: false,
  android: {
    bars: { top: 52.19, right: 48, bottom: 0, left: 0 },
    caption: ZERO,
    cutout: { top: 0, right: 0, bottom: 0, left: 54.095 },
    captionTransparent: false,
    corners: [
      { x: 0, y: 0, width: 50.286, height: 50.286 },
      { x: 873.143, y: 0, width: 50.286, height: 50.286 },
      { x: 873.143, y: 361.143, width: 50.286, height: 50.286 },
      { x: 0, y: 361.143, width: 50.286, height: 50.286 },
    ],
  },
};

export const fixtures = {
  iPhoneDuoOuterPortrait,
  iPhoneDuoOuterPortraitWithTabBar,
  iPhoneDuoOuterPortraitWithNativeHeader,
  iPhoneDuoOuterLandscape,
  iPhoneDuoInnerLandscape,
  iPhoneDuoInnerBookFold,
  iPhoneDuoInnerPortrait,
  iPhone18ProPortrait,
  iPadProFullScreen,
  iPadProWindow,
  pixel10Portrait,
  pixel10Landscape,
};

export type FixtureName = keyof typeof fixtures;
