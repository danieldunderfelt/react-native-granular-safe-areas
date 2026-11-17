import type { GranularSafeAreaMetrics } from './types';

/**
 * Recorded metrics for previews and tests. Pass one to `<GranularSafeAreaProvider mock={...}>` to lay out for a device
 * you don't have, including on the web.
 *
 * NOTE: the iPhone Duo values are estimates until probe output from the simulator or a device replaces them. The
 * size and insets come from public figures (466 x 678 pt, right 84, bottom 34). The camera, status cluster and tab bar
 * positions were measured on a screenshot of an app on the outer display.
 */

const base = {
  layoutDirection: 'ltr',
  statusBar: null,
  barRegionInsets: null,
  occlusions: [],
  divisions: [],
  systemBars: [],
  barContainersVisible: false,
} satisfies Partial<GranularSafeAreaMetrics>;

/** iPhone Duo, closed (outer display), portrait, with no system bars in the column. */
const iPhoneDuoOuterPortrait: GranularSafeAreaMetrics = {
  ...base,
  width: 466,
  height: 678,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  verticalBarEdge: 'trailing',
  // The camera and Dynamic Island at the top of the column; the frame includes UIKit's margins.
  occlusions: [{ x: 396, y: 20, width: 46, height: 88, active: true }],
  // The vertical status bar under the camera: time and signal.
  statusBar: { x: 382, y: 108, width: 84, height: 100 },
  barRegionInsets: { top: 208, right: 0, bottom: 34, left: 382 },
  reservedRegionsSupported: true,
};

/** iPhone Duo, closed, portrait, with a native tab bar in the vertical column (react-native-screens native tabs). */
const iPhoneDuoOuterPortraitWithTabBar: GranularSafeAreaMetrics = {
  ...iPhoneDuoOuterPortrait,
  systemBars: [{ x: 392, y: 440, width: 52, height: 214 }],
  barContainersVisible: true,
};

/** iPhone Duo, open (inner display), landscape, fully open: the fold is inactive and the inner camera is off. */
const iPhoneDuoInnerLandscape: GranularSafeAreaMetrics = {
  ...base,
  width: 951,
  height: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  verticalBarEdge: 'trailing',
  occlusions: [{ x: 450, y: 0, width: 51, height: 40, active: false }],
  divisions: [{ x: 475.5, y: 0, width: 0, height: 669, active: false }],
  statusBar: { x: 867, y: 0, width: 84, height: 190 },
  barRegionInsets: { top: 190, right: 0, bottom: 34, left: 867 },
  reservedRegionsSupported: true,
};

/** iPhone Duo, inner display, partially folded like a book: the fold divides the display. */
const iPhoneDuoInnerBookFold: GranularSafeAreaMetrics = {
  ...iPhoneDuoInnerLandscape,
  divisions: [{ x: 455.5, y: 0, width: 40, height: 669, active: true }],
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
  iPhoneDuoInnerLandscape,
  iPhoneDuoInnerBookFold,
  iPhone18ProPortrait,
};

export type FixtureName = keyof typeof fixtures;
