import type { GranularSafeAreaMetrics } from './types';

/**
 * Recorded metrics for previews and tests. Pass one to `<GranularSafeAreaProvider mock={...}>` to lay out for a device
 * you don't have, including on the web.
 *
 * The iPhone Duo closed (outer display) values were recorded on the iPhone Duo simulator (iOS 27.2). Values not marked
 * as recorded are estimates.
 */

const base = {
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

export const fixtures = {
  iPhoneDuoOuterPortrait,
  iPhoneDuoOuterPortraitWithTabBar,
  iPhoneDuoOuterPortraitWithNativeHeader,
  iPhoneDuoOuterLandscape,
  iPhoneDuoInnerLandscape,
  iPhoneDuoInnerBookFold,
  iPhoneDuoInnerPortrait,
  iPhone18ProPortrait,
};

export type FixtureName = keyof typeof fixtures;
