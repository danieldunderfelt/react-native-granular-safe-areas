import { fixtures } from '../fixtures';
import {
  buildRegions,
  metricsForSubrect,
  getSystemControls,
  metricsFromInsets,
  safeAreaViewInsets,
  trackedRegions,
} from '../geometry';
import { parseMetrics } from '../metrics';
import type { GranularSafeAreaMetrics, Rect } from '../types';

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

function android(
  metrics: Pick<GranularSafeAreaMetrics, 'width' | 'height' | 'insets'> &
    Partial<GranularSafeAreaMetrics>
): GranularSafeAreaMetrics {
  return {
    platform: 'android',
    verticalBarEdge: null,
    layoutDirection: 'ltr',
    statusBar: null,
    barRegionInsets: null,
    occlusions: [],
    divisions: [],
    systemBars: [],
    barContainersVisible: false,
    barItemsKnown: false,
    reservedRegionsSupported: false,
    ...metrics,
  };
}

/** A phone in landscape with a punch-hole camera on the left. */
const landscape = android({
  width: 915,
  height: 412,
  insets: { top: 24, right: 0, bottom: 24, left: 52 },
  statusBar: { x: 0, y: 0, width: 915, height: 24 },
  occlusions: [{ x: 0, y: 182, width: 52, height: 48, active: true }],
  android: {
    bars: { top: 24, right: 0, bottom: 24, left: 0 },
    caption: ZERO,
    cutout: { top: 0, right: 0, bottom: 0, left: 52 },
    captionTransparent: false,
    corners: [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 875, y: 0, width: 40, height: 40 },
      { x: 875, y: 372, width: 40, height: 40 },
      { x: 0, y: 372, width: 40, height: 40 },
    ],
  },
});

/** The same phone in portrait: the camera is inside the status bar's band. */
const portrait = android({
  width: 412,
  height: 915,
  insets: { top: 52, right: 0, bottom: 24, left: 0 },
  statusBar: { x: 0, y: 0, width: 412, height: 52 },
  occlusions: [{ x: 182, y: 0, width: 48, height: 52, active: true }],
  android: {
    bars: { top: 52, right: 0, bottom: 24, left: 0 },
    caption: ZERO,
    cutout: { top: 52, right: 0, bottom: 0, left: 0 },
    captionTransparent: false,
    corners: [],
  },
});

/** A window in desktop windowing that draws its own title bar, under a transparent caption bar. */
const desktop = android({
  width: 800,
  height: 600,
  insets: { top: 40, right: 0, bottom: 0, left: 0 },
  systemBars: [
    { x: 0, y: 0, width: 48, height: 40 },
    { x: 680, y: 0, width: 120, height: 40 },
  ],
  android: {
    bars: ZERO,
    caption: { top: 40, right: 0, bottom: 0, left: 0 },
    cutout: ZERO,
    captionTransparent: true,
    corners: [],
  },
});

const pixel10Portrait = fixtures.pixel10Portrait;
const pixel10Landscape = fixtures.pixel10Landscape;

const band = (edge: 'top' | 'right' | 'bottom' | 'left', frame: Rect) => ({
  kind: 'inset' as const,
  edge,
  frame,
});

describe('buildRegions on Android', () => {
  it('breaks a band made only of the cutout down into the camera and the rounded corners', () => {
    expect(buildRegions(landscape)).toEqual([
      band('top', { x: 0, y: 0, width: 915, height: 24 }),
      band('bottom', { x: 0, y: 388, width: 915, height: 24 }),
      {
        kind: 'cutout',
        edge: 'left',
        frame: { x: 0, y: 0, width: 52, height: 40 },
      },
      {
        kind: 'cutout',
        edge: 'left',
        frame: { x: 0, y: 182, width: 52, height: 48 },
      },
      {
        kind: 'cutout',
        edge: 'left',
        frame: { x: 0, y: 372, width: 52, height: 40 },
      },
    ]);
  });

  it('keeps bands with the status or navigation bar in them whole', () => {
    expect(buildRegions(portrait)).toEqual([
      band('top', { x: 0, y: 0, width: 412, height: 52 }),
      band('bottom', { x: 0, y: 891, width: 412, height: 24 }),
    ]);
  });

  it('keeps every band whole without refining', () => {
    expect(buildRegions(landscape, { granular: false })).toEqual([
      band('top', { x: 0, y: 0, width: 915, height: 24 }),
      band('bottom', { x: 0, y: 388, width: 915, height: 24 }),
      band('left', { x: 0, y: 0, width: 52, height: 412 }),
    ]);
  });

  it('keeps a cutout band whole when the navigation bar shares the edge', () => {
    const buttons = android({
      ...landscape,
      insets: { top: 24, right: 0, bottom: 0, left: 52 },
      android: {
        ...landscape.android!,
        bars: { top: 24, right: 0, bottom: 0, left: 48 },
      },
    });
    expect(buildRegions(buttons)).toEqual([
      band('top', { x: 0, y: 0, width: 915, height: 24 }),
      band('left', { x: 0, y: 0, width: 52, height: 412 }),
    ]);
  });

  it('keeps a cutout band whole when no camera was found in it', () => {
    expect(buildRegions({ ...landscape, occlusions: [] })).toContainEqual(
      band('left', { x: 0, y: 0, width: 52, height: 412 })
    );
  });

  it('keeps every band whole without the breakdown, like a regular safe area', () => {
    const { android: _android, ...plain } = landscape;
    expect(buildRegions(plain)).toEqual(
      buildRegions(landscape, { granular: false })
    );
    expect(
      buildRegions(metricsFromInsets(915, 412, landscape.insets, 'android'))
    ).toEqual(buildRegions(landscape, { granular: false }));
  });

  it('breaks a transparent caption bar down into its window buttons', () => {
    expect(buildRegions(desktop)).toEqual([
      {
        kind: 'controls',
        edge: 'top',
        frame: { x: 0, y: 0, width: 48, height: 40 },
      },
      {
        kind: 'controls',
        edge: 'top',
        frame: { x: 680, y: 0, width: 120, height: 40 },
      },
    ]);
  });

  it('keeps an opaque caption bar whole', () => {
    const opaque = android({
      ...desktop,
      android: { ...desktop.android!, captionTransparent: false },
    });
    expect(buildRegions(opaque)).toEqual([
      band('top', { x: 0, y: 0, width: 800, height: 40 }),
    ]);
  });

  it('keeps a caption bar whole when the platform says nothing about its buttons', () => {
    expect(buildRegions({ ...desktop, systemBars: [] })).toEqual([
      band('top', { x: 0, y: 0, width: 800, height: 40 }),
    ]);
  });

  it('adds active folds', () => {
    const fold = { x: 0, y: 440, width: 412, height: 0, active: true };
    const folded = android({
      ...portrait,
      divisions: [fold, { ...fold, y: 300, active: false }],
    });
    expect(buildRegions(folded)).toContainEqual({
      kind: 'fold',
      edge: null,
      frame: { x: 0, y: 440, width: 412, height: 0 },
    });
    expect(buildRegions(folded).filter((r) => r.kind === 'fold')).toHaveLength(
      1
    );
  });
});

describe('recorded on the Pixel 10 emulator', () => {
  it('keeps the portrait bands whole: the camera is inside the status bar band', () => {
    expect(buildRegions(pixel10Portrait)).toEqual([
      band('top', { x: 0, y: 0, width: 411.429, height: 54.095 }),
      band('bottom', { x: 0, y: 875.429, width: 411.429, height: 48 }),
    ]);
  });

  it('breaks the landscape cutout band down into the camera and the corners', () => {
    expect(buildRegions(pixel10Landscape)).toEqual([
      band('top', { x: 0, y: 0, width: 923.429, height: 52.19 }),
      band('right', { x: 875.429, y: 0, width: 48, height: 411.429 }),
      {
        kind: 'cutout',
        edge: 'left',
        frame: { x: 0, y: 0, width: 54.095, height: 50.286 },
      },
      {
        kind: 'cutout',
        edge: 'left',
        frame: { x: 0, y: 184.762, width: 54.095, height: 41.905 },
      },
      {
        kind: 'cutout',
        edge: 'left',
        frame: { x: 0, y: 361.143, width: 54.095, height: 50.286 },
      },
    ]);
  });

  it('moves a granular view beside the camera, and only there', () => {
    const options = {
      regions: buildRegions(pixel10Landscape),
      bands: buildRegions(pixel10Landscape, { granular: false }),
      bounds: pixel10Landscape,
      granular: true,
    };
    // A 44 pt row at x 0, level with the camera, then halfway down between the camera and the corner.
    expect(
      safeAreaViewInsets({ x: 0, y: 190, width: 300, height: 44 }, options)
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 54.095 });
    expect(
      safeAreaViewInsets({ x: 0, y: 260, width: 300, height: 44 }, options)
    ).toEqual(ZERO);
  });
});

describe('getSystemControls on Android', () => {
  it('is the caption bar with its window buttons', () => {
    expect(
      getSystemControls(desktop, [{ x: 56, y: 4, width: 32, height: 32 }])
    ).toEqual({
      edge: 'top',
      strip: { x: 0, y: 0, width: 800, height: 40 },
      occupied: [
        { x: 0, y: 0, width: 48, height: 40 },
        { x: 56, y: 0, width: 32, height: 40 },
        { x: 680, y: 0, width: 120, height: 40 },
      ],
      free: [
        { x: 48, y: 0, width: 8, height: 40 },
        { x: 88, y: 0, width: 592, height: 40 },
      ],
      itemSize: 40,
      center: 20,
    });
  });

  it("is null where there's no caption bar the app draws", () => {
    expect(getSystemControls(portrait)).toBeNull();
    expect(getSystemControls(landscape)).toBeNull();
  });
});

describe('Android insets', () => {
  const options = (metrics: GranularSafeAreaMetrics) => ({
    regions: buildRegions(metrics),
    bands: buildRegions(metrics, { granular: false }),
    bounds: metrics,
  });

  it('clears only the camera for granular views beside it', () => {
    // Level with the camera, and below it.
    expect(
      safeAreaViewInsets(
        { x: 0, y: 190, width: 200, height: 30 },
        { ...options(landscape), granular: true }
      )
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 52 });
    expect(
      safeAreaViewInsets(
        { x: 0, y: 280, width: 200, height: 30 },
        { ...options(landscape), granular: true }
      )
    ).toEqual(ZERO);
  });

  it('keeps clear of the rounded corners a whole band kept clear of', () => {
    expect(
      safeAreaViewInsets(
        { x: 0, y: 24, width: 200, height: 30 },
        { ...options(landscape), granular: true, edges: ['left'] }
      ).left
    ).toBe(52);
  });

  it('avoids the whole band by default, like a regular safe area', () => {
    expect(
      safeAreaViewInsets(
        { x: 0, y: 280, width: 200, height: 30 },
        options(landscape)
      )
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 52 });
  });

  it('hands the native view the bands and regions it tracks', () => {
    expect(trackedRegions(buildRegions(landscape), {})).toContainEqual({
      x: 0,
      y: 182,
      width: 52,
      height: 48,
      edge: 4,
      side: 0,
      owner: 0,
      band: false,
    });
  });
});

describe('parseMetrics on Android', () => {
  it('keeps the breakdown of the insets', () => {
    const parsed = parseMetrics(JSON.stringify(landscape));
    expect(parsed).toEqual(landscape);
  });

  it('drops an incomplete breakdown, which keeps the bands whole', () => {
    const parsed = parseMetrics(
      JSON.stringify({ ...landscape, android: { bars: ZERO } })
    );
    expect(parsed?.android).toBeUndefined();
    expect(buildRegions(parsed!)).toEqual(
      buildRegions(landscape, { granular: false })
    );
  });
});

describe('metricsForSubrect on Android', () => {
  it('shifts what the insets are made of, and the rounded corners', () => {
    const sub = metricsForSubrect(pixel10Landscape, {
      x: 20,
      y: 30,
      width: 903.429,
      height: 381.429,
    });
    expect(sub.insets.top).toBeCloseTo(22.19);
    expect(sub.insets.left).toBeCloseTo(34.095);
    expect(sub.insets.right).toBe(48);
    expect(sub.android?.cutout.left).toBeCloseTo(34.095);
    expect(sub.android?.bars.top).toBeCloseTo(22.19);
    expect(sub.android?.corners[0]).toEqual({
      x: -20,
      y: -30,
      width: 50.286,
      height: 50.286,
    });
  });
});
