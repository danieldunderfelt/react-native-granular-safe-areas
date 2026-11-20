import { fixtures } from '../fixtures';
import {
  activeEdges,
  buildRegions,
  computeElementInsets,
  edgeMask,
  edgeModes,
  getVerticalBar,
  followsOwnPadding,
  metricsForSubrect,
  placementToRect,
  regionsEqual,
  metricsFromInsets,
  removeOffset,
  resolveVerticalBarEdge,
  safeAreaViewInsets,
  trackedRegions,
  verticalBarBackButtonFrame,
  withoutMargins,
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
        kind: 'controls',
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
    expect(buildRegions(duoTabs, { granular: false })).toEqual([
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
    expect(regions.map((r) => r.kind)).toEqual(['status', 'inset', 'controls']);
  });

  it('splits the column around the back button UIKit puts below the status cluster', () => {
    const regions = buildRegions(
      fixtures.iPhoneDuoOuterPortraitWithNativeHeader
    );
    expect(regions).toContainEqual({
      kind: 'controls',
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
      regions.filter((r) => r.kind === 'controls' && r.frame.x === 382)
    ).toHaveLength(1);
    expect(regions).toContainEqual({
      kind: 'controls',
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
      kind: 'controls',
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
      platform: 'ios',
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
        kind: 'cutout',
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

describe('safeAreaViewInsets', () => {
  const regions = buildRegions(duoTabs);
  const bands = buildRegions(duoTabs, { granular: false });
  const view = (
    element: Rect,
    options: Partial<Parameters<typeof safeAreaViewInsets>[1]> = {}
  ) => safeAreaViewInsets(element, { regions, bands, bounds, ...options });
  const vertical = { vertical: true, horizontal: false };
  const badgeAt = (y: number) => ({ x: 316, y, width: 122, height: 24 });

  describe('by default', () => {
    it('avoids the whole band, even in the free stretch of the column', () => {
      const card = { x: 16, y: 230, width: 434, height: 180 };
      expect(view(card).right).toBe(450 - 382);
    });

    it('gives the same result as granular next to the status cluster', () => {
      expect(view(badgeAt(150))).toEqual(
        view(badgeAt(150), { granular: true })
      );
    });

    it('still avoids UIKit bars outside the column, which no band covers', () => {
      const navigationBar = { x: 0, y: 62, width: 402, height: 54 };
      const metrics = {
        ...fixtures.iPhone18ProPortrait,
        systemBars: [navigationBar],
        barContainersVisible: true,
      };
      const button = { x: 300, y: 70, width: 90, height: 36 };
      const insets = safeAreaViewInsets(button, {
        regions: buildRegions(metrics),
        bands: buildRegions(metrics, { granular: false }),
        bounds: { width: 402, height: 874 },
      });
      expect(insets.top).toBe(116 - 70);
    });
  });

  describe('granular', () => {
    it('leaves the free stretch of the column alone', () => {
      const card = { x: 16, y: 230, width: 434, height: 180 };
      expect(view(card, { granular: true }).right).toBe(0);
    });

    it('pushes in only what is beside a region', () => {
      expect(view(badgeAt(150), { granular: true }).right).toBe(438 - 382);
      expect(view(badgeAt(500), { granular: true }).right).toBe(438 - 382);
    });
  });

  describe('in a scroll view', () => {
    it('keeps content clear of the whole column, wherever it is', () => {
      for (const y of [150, 300, 500]) {
        expect(view(badgeAt(y), { scroll: vertical }).right).toBe(438 - 382);
      }
    });

    it('pushes in content measured while it was scrolled out of view', () => {
      expect(view(badgeAt(900)).right).toBe(0);
      expect(view(badgeAt(900), { scroll: vertical })).toEqual({
        top: 0,
        right: 438 - 382,
        bottom: 0,
        left: 0,
      });
    });

    it('leaves the edges it scrolls towards to the content inset', () => {
      const row = { x: 0, y: 640, width: 466, height: 30 };
      expect(view(row).bottom).toBe(670 - 644);
      expect(view(row, { scroll: vertical }).bottom).toBe(0);
    });

    it('avoids whole bands even when granular, since its position along the axis is not fixed', () => {
      const card = { x: 16, y: 230, width: 434, height: 180 };
      expect(view(card, { granular: true, scroll: vertical }).right).toBe(
        450 - 382
      );
    });
  });

  describe('dynamic', () => {
    it('pushes a scrolling badge in only while it passes a region', () => {
      const dynamic = { dynamic: true, scroll: vertical };
      expect(view(badgeAt(150), dynamic).right).toBe(438 - 382);
      expect(view(badgeAt(300), dynamic).right).toBe(0);
      expect(view(badgeAt(500), dynamic).right).toBe(438 - 382);
      // Below the screen: nothing until it scrolls in.
      expect(view(badgeAt(900), dynamic).right).toBe(0);
    });

    it('does not stick to the bottom inset as it scrolls past it', () => {
      expect(
        view(badgeAt(650), { dynamic: true, scroll: vertical }).bottom
      ).toBe(0);
    });

    it('avoids what it overlaps right now outside scroll views too', () => {
      expect(view(badgeAt(300), { dynamic: true }).right).toBe(0);
    });
  });
});

describe('what covers a view', () => {
  // A regular iPhone with a native tab bar, and a boarding pass button floating above it.
  const iPhone = fixtures.iPhone18ProPortrait;
  const tabBar = { x: 0, y: 791, width: 402, height: 83, owner: 1 };
  const phone = {
    ...iPhone,
    systemBars: [tabBar],
    barContainersVisible: true,
  };
  const boardingPass: SafeAreaRegion = {
    kind: 'accessory',
    edge: 'bottom',
    frame: { x: 12, y: 720, width: 378, height: 56 },
    owner: -1,
  };
  const phoneRegions = [...buildRegions(phone), boardingPass];
  const phoneBands = [
    ...buildRegions(phone, { granular: false }),
    boardingPass,
  ];
  const phoneBounds = { width: 402, height: 874 };
  const onPhone = (
    element: Rect,
    options: Partial<Parameters<typeof safeAreaViewInsets>[1]> = {}
  ) =>
    safeAreaViewInsets(element, {
      regions: phoneRegions,
      bands: phoneBands,
      bounds: phoneBounds,
      edges: ['bottom'],
      ...options,
    });
  const nothingBelow = () => false;

  it('gives screen content the tab bar and the accessory above it', () => {
    const content = { x: 0, y: 0, width: 402, height: 874 };
    expect(onPhone(content).bottom).toBe(874 - 720);
  });

  it('gives a sheet only the home indicator: the tab bar and the accessory are beneath it', () => {
    const sheet = { x: 0, y: 400, width: 402, height: 474 };
    expect(
      onPhone(sheet, { covers: nothingBelow, visible: sheet }).bottom
    ).toBe(34);
  });

  it('gives a JS overlay at the root the same, and granular content too', () => {
    const button = { x: 16, y: 800, width: 370, height: 50 };
    expect(onPhone(button, { covers: nothingBelow }).bottom).toBe(850 - 840);
    expect(
      onPhone(button, { covers: nothingBelow, granular: true }).bottom
    ).toBe(850 - 840);
  });

  it('still lets an accessory drawn on top of the overlay count', () => {
    const content = { x: 0, y: 0, width: 402, height: 874 };
    const onlyTheAccessory = (owner: number) => owner === -1;
    expect(onPhone(content, { covers: onlyTheAccessory }).bottom).toBe(
      874 - 720
    );
  });

  describe('on the iPhone Duo', () => {
    const duoWithTabs = {
      ...duoTabs,
      systemBars: duoTabs.systemBars.map((bar) => ({ ...bar, owner: 7 })),
    };
    const regions = buildRegions(duoWithTabs);
    const bands = buildRegions(duoWithTabs, { granular: false });
    const onDuo = (
      element: Rect,
      options: Partial<Parameters<typeof safeAreaViewInsets>[1]> = {}
    ) => safeAreaViewInsets(element, { regions, bands, bounds, ...options });

    it('gives a sheet below the status cluster nothing in the column, even avoiding whole bands', () => {
      const sheet = { x: 8, y: 255, width: 450, height: 423 };
      expect(onDuo(sheet, { covers: nothingBelow, visible: sheet })).toEqual({
        top: 0,
        right: 0,
        bottom: 678 - 644,
        left: 0,
      });
    });

    it('keeps the status cluster for a modal that reaches it', () => {
      const modal = { x: 0, y: 0, width: 466, height: 678 };
      expect(onDuo(modal, { covers: nothingBelow, visible: modal }).right).toBe(
        84
      );
      expect(
        onDuo(
          { x: 316, y: 500, width: 122, height: 24 },
          { covers: nothingBelow, visible: modal, granular: true }
        ).right
      ).toBe(0);
    });

    it('keeps the column for the screen beneath, where the tab bar is on top', () => {
      const card = { x: 16, y: 230, width: 434, height: 180 };
      expect(onDuo(card).right).toBe(450 - 382);
      expect(
        onDuo({ x: 316, y: 500, width: 122, height: 24 }, { granular: true })
          .right
      ).toBe(438 - 382);
    });
  });

  describe('where a view can be seen', () => {
    it('only counts the part inside its clipping ancestors', () => {
      // A row half scrolled out of a list that ends above the tab bar.
      const list = { x: 0, y: 100, width: 402, height: 600 };
      const row = { x: 0, y: 650, width: 402, height: 100 };
      expect(onPhone(row, { granular: true }).bottom).toBe(750 - 720);
      expect(onPhone(row, { granular: true, visible: list }).bottom).toBe(0);
    });

    it('sweeps scrolling content over its scroll view, not the whole screen', () => {
      const regions = buildRegions(duo);
      const bands = buildRegions(duo, { granular: false });
      const item = { x: 16, y: 300, width: 434, height: 40 };
      const inside = (visible: Rect) =>
        safeAreaViewInsets(item, {
          regions,
          bands,
          bounds,
          scroll: { vertical: true, horizontal: false },
          visible,
        }).right;
      // A carousel in the free stretch of the column never scrolls its items under anything there.
      expect(inside({ x: 0, y: 260, width: 466, height: 120 })).toBe(0);
      // A list that reaches up to the status cluster does.
      expect(inside({ x: 0, y: 100, width: 466, height: 400 })).toBe(450 - 382);
    });
  });
});

describe('the native side', () => {
  const regions = buildRegions(duoTabs);

  it('gets the regions to avoid, already filtered and grown', () => {
    expect(
      trackedRegions(regions, { avoid: ['status', 'controls'], spacing: 4 })
    ).toEqual([
      {
        x: 378,
        y: -4,
        width: 92,
        height: 182,
        edge: 2,
        side: 0,
        owner: 0,
        band: false,
      },
      {
        x: 378,
        y: 488,
        width: 92,
        height: 170,
        edge: 2,
        side: 0,
        owner: 0,
        band: false,
      },
    ]);
  });

  it('gets every kind it avoids', () => {
    expect(trackedRegions(regions, {}).map((r) => r.edge)).toEqual([2, 2, 3]);
    expect(trackedRegions(regions, { avoid: [] })).toEqual([]);
  });

  it('marks floating regions with edge 0', () => {
    const fold = buildRegions(fixtures.iPhoneDuoInnerBookFold);
    expect(
      trackedRegions(fold, { avoid: ['fold'] }).map((r) => r.edge)
    ).toEqual([0]);
  });

  it('gets edges as bits', () => {
    expect(edgeMask(['top', 'right', 'bottom', 'left'])).toBe(15);
    expect(edgeMask(['left', 'right'])).toBe(10);
    expect(edgeMask(['right', 'right'])).toBe(2);
    expect(edgeMask([])).toBe(0);
  });
});

describe('edgeModes', () => {
  it('makes every edge additive by default, like react-native-safe-area-context', () => {
    expect(edgeModes(undefined)).toEqual({
      top: 'additive',
      right: 'additive',
      bottom: 'additive',
      left: 'additive',
    });
  });

  it('turns a list into additive edges, and the rest off', () => {
    expect(edgeModes(['left', 'right'])).toEqual({
      top: 'off',
      right: 'additive',
      bottom: 'off',
      left: 'additive',
    });
  });

  it('takes an object as is, with missing edges off', () => {
    const modes = edgeModes({ top: 'maximum', bottom: 'additive' });
    expect(modes).toEqual({
      top: 'maximum',
      right: 'off',
      bottom: 'additive',
      left: 'off',
    });
    expect(activeEdges(modes)).toEqual(['top', 'bottom']);
  });
});

describe('withoutMargins', () => {
  it('measures a view as it was before the margin it got moved it in', () => {
    expect(
      withoutMargins(
        { x: 0, y: 10, width: 382, height: 60 },
        { top: 0, right: 84, bottom: 0, left: 0 }
      )
    ).toEqual({ x: 0, y: 10, width: 466, height: 60 });
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
      ...metricsFromInsets(
        100,
        200,
        { top: 1, right: 2, bottom: 3, left: 4 },
        'ios'
      ),
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
      kind: 'controls',
      edge: 'top',
      frame: navigationBar,
    });
    expect(regions).toContainEqual({
      kind: 'controls',
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

describe('iPad window controls', () => {
  const window = fixtures.iPadProWindow;
  const regions = buildRegions(window);
  const windowBounds = { width: window.width, height: window.height };
  const inWindow = (
    element: Rect,
    options: Partial<Parameters<typeof computeElementInsets>[2]> = {}
  ) =>
    computeElementInsets(element, regions, {
      bounds: windowBounds,
      ...options,
    });
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };

  it('become a controls region in the top-left corner', () => {
    expect(regions).toContainEqual({
      kind: 'controls',
      edge: 'top',
      side: 'left',
      frame: { x: 0, y: 0, width: 66, height: 53 },
    });
  });

  it("aren't over the app when the window fills the screen", () => {
    expect(buildRegions(fixtures.iPadProFullScreen).map((r) => r.kind)).toEqual(
      ['inset', 'inset']
    );
  });

  it('are on the right when the window reports them there', () => {
    const rtl = buildRegions({
      ...window,
      windowControls: { x: 309, y: 0, width: 66, height: 53 },
    });
    expect(rtl).toContainEqual(
      expect.objectContaining({ edge: 'top', side: 'right' })
    );
  });

  it('move a header level with them over, as a toolbar does', () => {
    expect(inWindow({ x: 0, y: 0, width: 375, height: 64 })).toEqual({
      ...zero,
      top: 10,
      left: 66,
    });
  });

  it('move a button level with them over, out of their way', () => {
    expect(inWindow({ x: 16, y: 16, width: 44, height: 44 })).toEqual({
      ...zero,
      left: 50,
    });
  });

  it('move a whole screen or a sidebar below them', () => {
    expect(inWindow({ x: 0, y: 0, width: 375, height: 617 })).toEqual({
      ...zero,
      top: 53,
      bottom: 10,
    });
    expect(inWindow({ x: 0, y: 0, width: 250, height: 617 })).toEqual({
      ...zero,
      top: 53,
      bottom: 10,
    });
  });

  it('move an element below them when it may not move sideways', () => {
    expect(
      inWindow(
        { x: 0, y: 0, width: 375, height: 64 },
        { edges: ['top', 'right', 'bottom'] }
      )
    ).toEqual({ ...zero, top: 53 });
  });

  it('move an element sideways when it may not move down', () => {
    expect(
      inWindow(
        { x: 0, y: 0, width: 375, height: 617 },
        { edges: ['left', 'right', 'bottom'] }
      )
    ).toEqual({ ...zero, left: 66, bottom: 10 });
  });

  it('are left to the content inset in a vertical scroll view', () => {
    expect(
      safeAreaViewInsets(
        { x: 0, y: 0, width: 375, height: 64 },
        {
          regions,
          bands: buildRegions(window, { granular: false }),
          dynamic: true,
          scroll: { vertical: true, horizontal: false },
          bounds: windowBounds,
        }
      )
    ).toEqual(zero);
  });

  it('only move content down in a horizontal scroll view', () => {
    expect(
      safeAreaViewInsets(
        { x: 0, y: 0, width: 200, height: 64 },
        {
          regions,
          bands: buildRegions(window, { granular: false }),
          dynamic: true,
          scroll: { vertical: false, horizontal: true },
          bounds: windowBounds,
        }
      )
    ).toEqual({ ...zero, top: 53 });
  });

  it('reach the native side with their side', () => {
    expect(trackedRegions(regions, {})).toContainEqual({
      x: 0,
      y: 0,
      width: 66,
      height: 53,
      edge: 1,
      side: 4,
      owner: 0,
      band: false,
    });
  });

  it('move with a provider that starts inside the window', () => {
    const sub = metricsForSubrect(window, {
      x: 20,
      y: 0,
      width: 355,
      height: 617,
    });
    expect(sub.windowControls).toEqual({ x: -20, y: 0, width: 66, height: 53 });
  });

  it('survive parsing', () => {
    expect(parseMetrics(JSON.stringify(window))?.windowControls).toEqual(
      window.windowControls
    );
    expect(
      parseMetrics(JSON.stringify(fixtures.iPadProFullScreen))?.windowControls
    ).toBeUndefined();
  });
});
