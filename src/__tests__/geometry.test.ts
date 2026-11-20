import { fixtures } from '../fixtures';
import {
  buildRegions,
  computeElementInsets,
  edgeMask,
  getVerticalBar,
  followsOwnPadding,
  metricsForSubrect,
  placementToRect,
  regionsEqual,
  metricsFromInsets,
  removeOffset,
  resolveVerticalBarEdge,
  sweepElement,
  sweepRegions,
  trackedRegions,
  verticalBarBackButtonFrame,
  withoutScrollingEdges,
} from '../geometry';
import { parseMetrics } from '../metrics';
import type { GranularSafeAreaMetrics, Rect, SafeAreaRegion } from '../types';

const duo = fixtures.iPhoneDuoOuterPortrait;
const duoTabs = fixtures.iPhoneDuoOuterPortraitWithTabBar;
const bounds = { width: duo.width, height: duo.height };

const insetsFor = (
  element: Rect,
  regions: SafeAreaRegion[],
  options: Partial<Parameters<typeof computeElementInsets>[2]> = {}
) => computeElementInsets(element, regions, { bounds, ...options });

describe('buildRegions', () => {
  it('splits the Duo status column into the cluster and the system tab bar', () => {
    expect(buildRegions(duoTabs)).toEqual([
      {
        kind: 'status',
        edge: 'right',
        frame: { x: 382, y: 0, width: 84, height: 174 },
      },
      {
        kind: 'systemBar',
        edge: 'right',
        frame: { x: 382, y: 492, width: 84, height: 162 },
      },
      {
        kind: 'inset',
        edge: 'bottom',
        frame: { x: 0, y: 644, width: 466, height: 34 },
      },
    ]);
  });

  it('does not repeat the camera that sits inside the cluster', () => {
    expect(buildRegions(duo).map((r) => r.kind)).toEqual(['status', 'inset']);
  });

  it('keeps whole bands when refinement is off', () => {
    expect(buildRegions(duoTabs, { refine: false })).toEqual([
      {
        kind: 'inset',
        edge: 'right',
        frame: { x: 382, y: 0, width: 84, height: 678 },
      },
      {
        kind: 'inset',
        edge: 'bottom',
        frame: { x: 0, y: 644, width: 466, height: 34 },
      },
    ]);
  });

  it('keeps the band whole without reserved-region support', () => {
    const regions = buildRegions({
      ...duoTabs,
      reservedRegionsSupported: false,
    });
    expect(regions[0]).toMatchObject({ kind: 'inset', edge: 'right' });
  });

  it('keeps the band whole when nothing reports where the cluster ends', () => {
    const regions = buildRegions({
      ...duoTabs,
      occlusions: [],
      statusBar: null,
      barRegionInsets: null,
    });
    expect(regions[0]).toMatchObject({
      kind: 'inset',
      frame: { x: 382, y: 0, width: 84, height: 678 },
    });
  });

  it('does not refine on a camera region alone, which may stop above the status icons', () => {
    const regions = buildRegions({
      ...duo,
      statusBar: null,
      barRegionInsets: null,
    });
    expect(regions[0]).toMatchObject({ kind: 'inset', edge: 'right' });
  });

  it('keeps the band whole when bar containers are visible but no vertical bar was recognized', () => {
    const regions = buildRegions({
      ...duoTabs,
      systemBars: [],
      barItemsKnown: false,
    });
    expect(regions[0]).toMatchObject({ kind: 'inset', edge: 'right' });
  });

  it('trusts an empty vertical bar when the floating bar containers were found', () => {
    // A native stack's root screen: the navigation bar is visible, but nothing is in the vertical bar.
    const regions = buildRegions({
      ...duoTabs,
      systemBars: [{ x: 0, y: 24, width: 466, height: 58 }],
    });
    expect(regions.map((r) => r.kind)).toEqual([
      'status',
      'inset',
      'systemBar',
    ]);
  });

  it('splits the column around the back button UIKit puts below the status cluster', () => {
    const regions = buildRegions(
      fixtures.iPhoneDuoOuterPortraitWithNativeHeader
    );
    expect(regions).toContainEqual({
      kind: 'systemBar',
      edge: 'right',
      frame: { x: 382, y: 174, width: 84, height: 48 },
    });
  });

  it('keeps horizontal bars that cross the column out of the column, as regions of their own', () => {
    const toolbar = { x: 0, y: 594, width: 466, height: 50 };
    const regions = buildRegions({
      ...duoTabs,
      systemBars: [...duoTabs.systemBars, toolbar],
    });
    expect(
      regions.filter((r) => r.kind === 'systemBar' && r.frame.x === 382)
    ).toHaveLength(1);
    expect(regions).toContainEqual({
      kind: 'systemBar',
      edge: 'bottom',
      frame: toolbar,
    });
  });

  it('attaches a full-width bar to the nearer edge even when it does not touch it', () => {
    // The Duo's navigation bar starts 24 pt down, with a top inset of 0.
    const regions = buildRegions(
      fixtures.iPhoneDuoOuterPortraitWithNativeHeader
    );
    expect(regions).toContainEqual({
      kind: 'systemBar',
      edge: 'top',
      frame: { x: 0, y: 24, width: 466, height: 58 },
    });
  });

  it('keeps the band whole when the only bars found are horizontal and the bar items are unknown', () => {
    const regions = buildRegions({
      ...duoTabs,
      systemBars: [{ x: 0, y: 0, width: 466, height: 50 }],
      barItemsKnown: false,
    });
    expect(regions[0]).toMatchObject({ kind: 'inset', edge: 'right' });
  });

  it('frees the column in a sheet that starts below the status cluster', () => {
    // Recorded: a form sheet on the outer display. UIKit's bar region starts at the top of the sheet.
    const sheet: GranularSafeAreaMetrics = {
      width: 450,
      height: 341.6666564941406,
      insets: { top: 0, right: 76, bottom: 33.999989827473996, left: 0 },
      verticalBarEdge: 'trailing',
      layoutDirection: 'ltr',
      statusBar: { x: -8, y: -328.33333333333326, width: 466, height: 2 },
      barRegionInsets: {
        top: 0,
        right: 10,
        bottom: 33.999989827473996,
        left: 364,
      },
      occlusions: [],
      divisions: [],
      systemBars: [{ x: 0, y: -58, width: 450, height: 58 }],
      barContainersVisible: true,
      barItemsKnown: true,
      reservedRegionsSupported: true,
    };
    expect(buildRegions(sheet).map((r) => r.kind)).toEqual(['inset']);
    expect(getVerticalBar(sheet)?.top).toBe(0);
  });

  it('ignores the placeholder frame UIKit reports for a vertical status bar', () => {
    const regions = buildRegions({
      ...duo,
      barRegionInsets: null,
    });
    expect(regions[0]).toMatchObject({ kind: 'inset', edge: 'right' });
  });

  it('extends the cluster down to a camera that reaches below the status bar', () => {
    const regions = buildRegions({
      ...duo,
      occlusions: [{ x: 396, y: 20, width: 46, height: 260, active: true }],
    });
    expect(regions[0]?.frame.height).toBe(280);
  });

  it('takes the lowest of the cluster sources', () => {
    const regions = buildRegions({
      ...duo,
      barRegionInsets: { top: 250, right: 0, bottom: 34, left: 382 },
    });
    expect(regions[0]?.frame.height).toBe(250);
  });

  it('leaves a regular iPhone as plain bands, with the Dynamic Island inside the top band', () => {
    expect(buildRegions(fixtures.iPhone18ProPortrait)).toEqual([
      {
        kind: 'inset',
        edge: 'top',
        frame: { x: 0, y: 0, width: 402, height: 62 },
      },
      {
        kind: 'inset',
        edge: 'bottom',
        frame: { x: 0, y: 840, width: 402, height: 34 },
      },
    ]);
  });

  it('adds an active fold, and ignores an inactive one', () => {
    expect(
      buildRegions(fixtures.iPhoneDuoInnerLandscape).some(
        (r) => r.kind === 'fold'
      )
    ).toBe(false);
    expect(buildRegions(fixtures.iPhoneDuoInnerBookFold)).toContainEqual({
      kind: 'fold',
      edge: null,
      frame: { x: 455.5, y: 0, width: 40, height: 669 },
    });
  });

  it('attaches a free camera to the nearest edge it hugs', () => {
    const regions = buildRegions({
      ...metricsFromInsets(400, 800, { top: 0, right: 0, bottom: 0, left: 0 }),
      occlusions: [{ x: 300, y: 0, width: 100, height: 30, active: true }],
    });
    expect(regions).toEqual([
      {
        kind: 'camera',
        edge: 'top',
        frame: { x: 300, y: 0, width: 100, height: 30 },
      },
    ]);
  });
});

describe('resolveVerticalBarEdge', () => {
  it('maps trailing to the right in left-to-right layouts', () => {
    expect(resolveVerticalBarEdge(duo)).toBe('right');
  });

  it('follows the inset when the trait disagrees with the physical side (right-to-left)', () => {
    expect(resolveVerticalBarEdge({ ...duo, layoutDirection: 'rtl' })).toBe(
      'right'
    );
  });

  it('maps to the left when the bars really are on the left (Split View, left app)', () => {
    expect(
      resolveVerticalBarEdge({
        ...duo,
        verticalBarEdge: 'leading',
        insets: { top: 0, right: 0, bottom: 34, left: 84 },
      })
    ).toBe('left');
  });

  it('returns null without a vertical bar or an inset', () => {
    expect(resolveVerticalBarEdge(fixtures.iPhone18ProPortrait)).toBeNull();
    expect(
      resolveVerticalBarEdge({
        ...duo,
        insets: { top: 0, right: 0, bottom: 34, left: 0 },
      })
    ).toBeNull();
  });
});

describe('computeElementInsets on the Duo outer display (screenshot cases)', () => {
  const regions = buildRegions(duoTabs);

  it('pushes the header content in next to the status cluster', () => {
    const header = { x: 0, y: 0, width: 466, height: 60 };
    expect(insetsFor(header, regions)).toEqual({
      top: 0,
      right: 84,
      bottom: 0,
      left: 0,
    });
  });

  it('pushes the "Check-in" badge in by exactly its overlap', () => {
    const badge = { x: 316, y: 150, width: 122, height: 24 };
    expect(insetsFor(badge, regions).right).toBe(438 - 382);
  });

  it('leaves content in the free stretch of the column alone', () => {
    const card = { x: 16, y: 230, width: 434, height: 180 };
    expect(insetsFor(card, regions).right).toBe(0);
  });

  it('pushes the QR button clear of the system tab bar', () => {
    const qr = { x: 404, y: 540, width: 44, height: 44 };
    expect(insetsFor(qr, regions).right).toBe(448 - 382);
  });

  it('combines the tab bar and the home indicator for a bottom bar', () => {
    const bottomBar = { x: 0, y: 600, width: 466, height: 78 };
    expect(insetsFor(bottomBar, regions)).toEqual({
      top: 0,
      right: 84,
      bottom: 34,
      left: 0,
    });
  });

  it('only uses the edges it is allowed to', () => {
    const header = { x: 0, y: 0, width: 466, height: 60 };
    expect(insetsFor(header, regions, { edges: ['top'] }).right).toBe(0);
  });

  it('adds spacing around regions', () => {
    const card = { x: 16, y: 178, width: 400, height: 50 };
    expect(insetsFor(card, regions).right).toBe(0);
    expect(insetsFor(card, regions, { spacing: 8 }).right).toBe(416 - 374);
  });

  it('skips region kinds it is not asked to avoid', () => {
    const qr = { x: 404, y: 540, width: 44, height: 44 };
    expect(insetsFor(qr, regions, { avoid: ['status'] }).right).toBe(0);
  });

  it('ignores the part of an element that is off-screen', () => {
    const wide = { x: 0, y: 0, width: 600, height: 60 };
    expect(insetsFor(wide, regions).right).toBe(84);
  });
});

describe('computeElementInsets with floating regions', () => {
  const regions = buildRegions(fixtures.iPhoneDuoInnerBookFold);
  const foldBounds = { width: 951, height: 669 };

  it('ignores the fold unless asked', () => {
    const button = { x: 440, y: 300, width: 44, height: 44 };
    expect(
      computeElementInsets(button, regions, { bounds: foldBounds })
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('moves a button off the fold the cheapest way', () => {
    const button = { x: 440, y: 300, width: 44, height: 44 };
    const insets = computeElementInsets(button, regions, {
      bounds: foldBounds,
      avoid: ['fold'],
    });
    // Leaving to the left needs 484 - 455.5 = 28.5; to the right 495.5 - 440 = 55.5.
    expect(insets).toEqual({ top: 0, right: 28.5, bottom: 0, left: 0 });
  });
});

describe('sweepRegions', () => {
  it('treats the whole column as occupied for scrolling content', () => {
    const swept = sweepRegions(buildRegions(duoTabs), 'vertical', 466, 678);
    const card = { x: 16, y: 230, width: 434, height: 180 };
    expect(insetsFor(card, swept)).toEqual({
      top: 0,
      right: 450 - 382,
      bottom: 0,
      left: 0,
    });
  });

  it('drops regions on the scrolling edges', () => {
    const swept = sweepRegions(buildRegions(duoTabs), 'vertical', 466, 678);
    expect(swept.some((r) => r.edge === 'bottom')).toBe(false);
  });

  it('pushes in content measured while it was scrolled out of view', () => {
    const swept = sweepRegions(buildRegions(duo), 'vertical', 466, 678);
    // The "Check-in" badge of a card further down the list, below the screen when the list mounted.
    const badge = { x: 316, y: 900, width: 122, height: 24 };
    expect(insetsFor(badge, swept).right).toBe(0);
    expect(insetsFor(sweepElement(badge, 'vertical', bounds), swept)).toEqual({
      top: 0,
      right: 438 - 382,
      bottom: 0,
      left: 0,
    });
  });
});

describe('dynamic elements', () => {
  const regions = buildRegions(duoTabs);
  const scrolling = withoutScrollingEdges(regions, 'vertical');
  const badgeAt = (y: number) => ({ x: 316, y, width: 122, height: 24 });

  it('pushes a scrolling badge in only while it passes a region', () => {
    expect(insetsFor(badgeAt(150), scrolling).right).toBe(438 - 382);
    expect(insetsFor(badgeAt(300), scrolling).right).toBe(0);
    expect(insetsFor(badgeAt(500), scrolling).right).toBe(438 - 382);
    // Below the screen: nothing until it scrolls in.
    expect(insetsFor(badgeAt(900), scrolling).right).toBe(0);
  });

  it('does not stick to the bottom inset as it scrolls past it', () => {
    expect(insetsFor(badgeAt(650), scrolling).bottom).toBe(0);
  });

  it('hands the native side the regions to avoid, already filtered and grown', () => {
    expect(
      trackedRegions(regions, {
        avoid: ['status', 'systemBar'],
        spacing: 4,
        scrollable: 'vertical',
      })
    ).toEqual([
      { x: 378, y: -4, width: 92, height: 182, edge: 2 },
      { x: 378, y: 488, width: 92, height: 170, edge: 2 },
    ]);
  });

  it('keeps every kind it avoids, and the scrolling edges when not scrolling', () => {
    expect(trackedRegions(regions, {}).map((r) => r.edge)).toEqual([2, 2, 3]);
    expect(trackedRegions(regions, { avoid: [] })).toEqual([]);
  });

  it('marks floating regions with edge 0', () => {
    const fold = buildRegions(fixtures.iPhoneDuoInnerBookFold);
    expect(
      trackedRegions(fold, { avoid: ['fold'] }).map((r) => r.edge)
    ).toEqual([0]);
  });

  it('encodes edges as bits', () => {
    expect(edgeMask(['top', 'right', 'bottom', 'left'])).toBe(15);
    expect(edgeMask(['left', 'right'])).toBe(10);
    expect(edgeMask(['right', 'right'])).toBe(2);
    expect(edgeMask([])).toBe(0);
  });
});

describe('metricsForSubrect', () => {
  it('re-expresses window metrics for a provider below a 100 pt header', () => {
    const sub = metricsForSubrect(duoTabs, {
      x: 0,
      y: 100,
      width: 466,
      height: 578,
    });
    expect(sub.insets).toEqual({ top: 0, right: 84, bottom: 34, left: 0 });
    const regions = buildRegions(sub);
    expect(regions[0]).toEqual({
      kind: 'status',
      edge: 'right',
      frame: { x: 382, y: 0, width: 84, height: 74 },
    });
    expect(regions[1]?.frame).toEqual({
      x: 382,
      y: 392,
      width: 84,
      height: 162,
    });
  });

  it('drops insets for edges the subrect does not reach', () => {
    const sub = metricsForSubrect(duo, { x: 0, y: 0, width: 300, height: 300 });
    expect(sub.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('removeOffset', () => {
  it('undoes an applied translation', () => {
    const measured = { x: 334, y: 185, width: 104, height: 24 };
    const applied = { top: 0, right: 56, bottom: 0, left: 0 };
    expect(removeOffset(measured, applied)).toEqual({
      x: 390,
      y: 185,
      width: 104,
      height: 24,
    });
  });
});

describe('parseMetrics', () => {
  it('round-trips a fixture', () => {
    expect(parseMetrics(JSON.stringify(duoTabs))).toEqual(duoTabs);
  });

  it('degrades missing facts to unknown', () => {
    const minimal = parseMetrics(
      JSON.stringify({
        width: 100,
        height: 200,
        insets: { top: 1, right: 2, bottom: 3, left: 4 },
        statusBar: { x: 'nope' },
        verticalBarEdge: 'sideways',
      })
    );
    expect(minimal).toEqual<GranularSafeAreaMetrics>({
      ...metricsFromInsets(100, 200, { top: 1, right: 2, bottom: 3, left: 4 }),
      // Unknown counts as visible, which keeps bands whole.
      barContainersVisible: true,
    });
  });

  it('rejects malformed input', () => {
    expect(parseMetrics('')).toBeNull();
    expect(parseMetrics('{')).toBeNull();
    expect(parseMetrics('{"width": 1}')).toBeNull();
  });
});

describe('followsOwnPadding', () => {
  const box = { x: 100, y: 0, width: 200, height: 40 };
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  const padded = { top: 0, right: 56, bottom: 0, left: 0 };

  it('spots a content-sized element growing into the region by the padding it was given', () => {
    const grown = { ...box, width: 256 };
    expect(
      followsOwnPadding({ rect: box, applied: none }, grown, padded, 'right')
    ).toBe(true);
  });

  it('ignores an element whose size comes from its parent', () => {
    expect(
      followsOwnPadding({ rect: box, applied: none }, box, padded, 'right')
    ).toBe(false);
  });

  it('ignores size changes when the padding did not change', () => {
    const grown = { ...box, width: 256 };
    expect(
      followsOwnPadding({ rect: box, applied: padded }, grown, padded, 'right')
    ).toBe(false);
  });

  it('ignores a content-sized bar pinned to the bottom, which grows away from the region', () => {
    // A dock at the bottom of a 678 pt screen gets 34 pt of bottom padding: its top moves up, its bottom stays.
    const dock = { x: 0, y: 610, width: 466, height: 68 };
    const grown = { x: 0, y: 576, width: 466, height: 102 };
    expect(
      followsOwnPadding(
        { rect: dock, applied: none },
        grown,
        { ...none, bottom: 34 },
        'bottom'
      )
    ).toBe(false);
  });
});

describe('UIKit bars outside the column', () => {
  const iPhone = fixtures.iPhone18ProPortrait;
  const navigationBar = { x: 0, y: 62, width: 402, height: 54 };
  const tabBar = { x: 0, y: 791, width: 402, height: 49 };
  const metrics = {
    ...iPhone,
    systemBars: [navigationBar, tabBar],
    barContainersVisible: true,
  };
  const regions = buildRegions(metrics);
  const iPhoneBounds = { width: 402, height: 874 };

  it('turns a navigation bar under the status bar into a top region, and a tab bar into a bottom one', () => {
    expect(regions).toContainEqual({
      kind: 'systemBar',
      edge: 'top',
      frame: navigationBar,
    });
    expect(regions).toContainEqual({
      kind: 'systemBar',
      edge: 'bottom',
      frame: tabBar,
    });
  });

  it('pushes an element under a transparent header down below the bar', () => {
    const button = { x: 300, y: 70, width: 90, height: 36 };
    expect(
      computeElementInsets(button, regions, { bounds: iPhoneBounds }).top
    ).toBe(116 - 70);
  });

  it('follows a bar as it grows (large title expanding)', () => {
    const grown = buildRegions({
      ...metrics,
      systemBars: [{ ...navigationBar, height: 106 }, tabBar],
    });
    const button = { x: 300, y: 130, width: 90, height: 36 };
    expect(
      computeElementInsets(button, regions, { bounds: iPhoneBounds }).top
    ).toBe(0);
    expect(
      computeElementInsets(button, grown, { bounds: iPhoneBounds }).top
    ).toBe(168 - 130);
  });
});

describe('placementToRect', () => {
  const duoBounds = { width: 466, height: 678 };

  it('stretches missing sides to the provider, like absolute positioning', () => {
    expect(placementToRect({}, duoBounds)).toEqual({
      x: 0,
      y: 0,
      width: 466,
      height: 678,
    });
    expect(placementToRect({ top: 0, height: 56 }, duoBounds)).toEqual({
      x: 0,
      y: 0,
      width: 466,
      height: 56,
    });
  });

  it('anchors to the right and bottom', () => {
    expect(
      placementToRect(
        { right: 16, bottom: 120, width: 100, height: 40 },
        bounds
      )
    ).toEqual({ x: 350, y: 518, width: 100, height: 40 });
    expect(
      placementToRect({ left: 10, right: 20, bottom: 0, height: 80 }, duoBounds)
    ).toEqual({ x: 10, y: 598, width: 436, height: 80 });
  });
});

describe('regionsEqual', () => {
  it('compares by value, ignoring sub-pixel noise', () => {
    const a = buildRegions(duoTabs);
    const b = buildRegions(JSON.parse(JSON.stringify(duoTabs)));
    expect(regionsEqual(a, b)).toBe(true);
    expect(
      regionsEqual(
        a,
        buildRegions({
          ...duoTabs,
          barRegionInsets: { top: 260, right: 0, bottom: 34, left: 382 },
        })
      )
    ).toBe(false);
  });
});

describe('getVerticalBar', () => {
  it('describes the Duo column, with items centered on the camera', () => {
    expect(getVerticalBar(duoTabs)).toEqual({
      edge: 'right',
      column: { x: 382, y: 0, width: 84, height: 678 },
      top: 174,
      bottom: 644,
      centerX: 418,
      items: [{ x: 394, y: 492, width: 48, height: 162 }],
    });
  });

  it('starts below a Dynamic Island grown by a Live Activity', () => {
    const bar = getVerticalBar({
      ...duo,
      occlusions: [{ x: 382, y: 0, width: 84, height: 290, active: true }],
    });
    expect(bar?.top).toBe(290);
  });

  it('is null on a regular iPhone and without status information', () => {
    expect(getVerticalBar(fixtures.iPhone18ProPortrait)).toBeNull();
    expect(getVerticalBar({ ...duo, barRegionInsets: null })).toBeNull();
    expect(
      getVerticalBar({ ...duo, reservedRegionsSupported: false })
    ).toBeNull();
  });
});

describe('verticalBarBackButtonFrame', () => {
  it('puts the button where UIKit puts the back button: right below the status cluster', () => {
    const bar = getVerticalBar(duo);
    expect(bar && verticalBarBackButtonFrame(bar)).toEqual({
      x: 394,
      y: 174,
      width: 48,
      height: 48,
    });
  });

  it('matches the system back button on the inner display in landscape, below its shorter status cluster', () => {
    const bar = getVerticalBar(fixtures.iPhoneDuoInnerLandscape);
    // Where UIKit drew the back button of a native header in the same pose.
    expect(bar && verticalBarBackButtonFrame(bar)).toEqual({
      x: 879,
      y: 124,
      width: 48,
      height: 48,
    });
  });

  it('puts the bar on the left in landscape on the outer display, below the camera', () => {
    const metrics = fixtures.iPhoneDuoOuterLandscape;
    // Without the native header's own back button, which UIKit drew at { x: 24, y: 82, 48 x 48 }.
    const bar = getVerticalBar({ ...metrics, systemBars: [] });
    expect(bar?.edge).toBe('left');
    expect(bar && verticalBarBackButtonFrame(bar)).toEqual({
      x: 24,
      y: 82,
      width: 48,
      height: 48,
    });
    expect(buildRegions(metrics)).toContainEqual({
      kind: 'status',
      edge: 'left',
      frame: { x: 0, y: 0, width: 84, height: 82 },
    });
  });

  it('has no vertical bar on the inner display in portrait', () => {
    expect(getVerticalBar(fixtures.iPhoneDuoInnerPortrait)).toBeNull();
  });

  it('gives way to a back button UIKit already shows there', () => {
    const bar = getVerticalBar(fixtures.iPhoneDuoOuterPortraitWithNativeHeader);
    expect(bar && verticalBarBackButtonFrame(bar)).toBeNull();
  });

  it('shares the bar with a tab bar further down', () => {
    const bar = getVerticalBar(duoTabs);
    expect(bar && verticalBarBackButtonFrame(bar)).not.toBeNull();
  });
});
