import { fixtures } from '../fixtures';
import {
  buildRegions,
  edgeModes,
  getTabBarEdge,
  safeAreaViewInsets,
  withoutMargins,
  ZERO_INSETS,
} from '../geometry';
import { parseMetrics } from '../metrics';
import { mergeDefaults, resolveSafeAreaProps } from '../resolveProps';
import { layoutAdjustment } from '../style';

jest.mock('react-native', () => ({
  I18nManager: { isRTL: false, doLeftAndRightSwapInRTL: true },
  StyleSheet: {
    flatten: (style: unknown): unknown =>
      Array.isArray(style)
        ? Object.assign(
            {},
            ...style.map((s) =>
              (jest.requireMock('react-native') as any).StyleSheet.flatten(s)
            )
          )
        : (style ?? undefined),
  },
}));

describe('resolveSafeAreaProps', () => {
  it('fills in what the view leaves out from the defaults', () => {
    expect(
      resolveSafeAreaProps(
        { mode: 'offset' as const, testID: 'row' },
        { edges: ['left', 'right'], granular: true, mode: 'padding' }
      )
    ).toEqual({
      mode: 'offset',
      testID: 'row',
      edges: ['left', 'right'],
      granular: true,
    });
  });

  it('turns gap into spacing, with additive edges taking the larger value', () => {
    expect(
      resolveSafeAreaProps({ edges: ['top', 'right'], gap: 16 }, {})
    ).toEqual({
      edges: { top: 'maximum', right: 'maximum', bottom: 'off', left: 'off' },
      spacing: 16,
    });
    expect(
      resolveSafeAreaProps(
        { edges: { right: 'additive', top: 'off' }, gap: 8, spacing: 12 },
        {}
      )
    ).toMatchObject({
      edges: { top: 'off', right: 'maximum', bottom: 'off', left: 'off' },
      spacing: 12,
    });
  });

  it('takes gap from the defaults too', () => {
    expect(
      resolveSafeAreaProps({ edges: ['right'] }, { gap: 16 })
    ).toMatchObject({
      edges: { right: 'maximum' },
      spacing: 16,
    });
  });

  it('nests defaults', () => {
    expect(
      mergeDefaults(
        { edges: ['left', 'right'], granular: true },
        { granular: false, gap: 8 }
      )
    ).toEqual({ edges: ['left', 'right'], granular: false, gap: 8 });
  });
});

describe('gap, wherever the padding lives', () => {
  const duo = fixtures.iPhoneDuoOuterPortrait;
  const regions = buildRegions(duo);
  const bands = buildRegions(duo, { granular: false });
  const contentEnd = (
    element: { x: number; width: number },
    ownPadding: number,
    gap: number
  ) => {
    const props = resolveSafeAreaProps({ edges: ['right'], gap }, {});
    const inset = safeAreaViewInsets(
      { ...element, y: 50, height: 44 },
      {
        regions,
        bands,
        granular: true,
        edges: ['right'],
        spacing: (props as { spacing?: number }).spacing,
        bounds: duo,
      }
    ).right;
    return element.x + element.width - Math.max(ownPadding, inset);
  };

  it('keeps the content the same distance from the status cluster', () => {
    // The view owns its padding: full width, 16 pt of its own.
    expect(contentEnd({ x: 0, width: 466 }, 16, 16)).toBe(382 - 16);
    // The parent owns it: the view starts 16 pt in and has none.
    expect(contentEnd({ x: 16, width: 434 }, 0, 16)).toBe(382 - 16);
  });

  it('keeps the view’s box gap pt away from the column with mode="margin" and settles stably', () => {
    const simulateMargin = ({
      ownMargin,
      parentPadding = 0,
      gap,
      edges = ['right'] as const,
    }: {
      ownMargin: number;
      parentPadding?: number;
      gap?: number;
      edges?:
        | readonly ('top' | 'right' | 'bottom' | 'left')[]
        | { right: 'maximum' | 'additive' };
    }) => {
      const resolved = resolveSafeAreaProps(
        { edges: edges as any, mode: 'margin' as const, gap },
        {}
      );
      const modes = edgeModes(resolved.edges);
      const spacing = (resolved as { spacing?: number }).spacing ?? 0;
      let added = ZERO_INSETS;
      let boxEnd = duo.width - parentPadding - ownMargin;

      // Two measurement passes: first with ownMargin only, second verifying the withoutMargins fixed point.
      for (let pass = 0; pass < 2; pass++) {
        const laidOut = {
          x: parentPadding + ownMargin,
          y: 50,
          width: boxEnd - (parentPadding + ownMargin),
          height: 44,
        };
        const unadjusted = withoutMargins(laidOut, added);
        const insets = safeAreaViewInsets(unadjusted, {
          regions,
          bands,
          granular: true,
          edges: ['right'],
          spacing,
          bounds: duo,
        });
        const adj = layoutAdjustment(
          { marginRight: ownMargin },
          insets,
          'margin',
          modes
        );
        const appliedMargin =
          (adj.style?.marginRight as number | undefined) ?? ownMargin;
        added = adj.added;
        boxEnd = duo.width - parentPadding - appliedMargin;
      }
      return { boxEnd, addedRight: added.right };
    };

    // View owns marginRight: 16 with gap: 16 -> ends at 382 - 16 = 366 (16 pt away from column).
    expect(simulateMargin({ ownMargin: 16, gap: 16 })).toEqual({
      boxEnd: 382 - 16,
      addedRight: 84,
    });
    // Parent owns paddingRight: 16, view has no margin, gap: 16 -> same 366.
    expect(
      simulateMargin({ ownMargin: 0, parentPadding: 16, gap: 16 })
    ).toEqual({
      boxEnd: 382 - 16,
      addedRight: 84,
    });
    // Own margin already clears column slightly (6 pt away), gap: 16 -> pushed 10 pt further to 366.
    expect(simulateMargin({ ownMargin: 90, gap: 16 })).toEqual({
      boxEnd: 382 - 16,
      addedRight: 10,
    });
    // Own margin already further than gap: 16 -> keeps its own 120 pt margin.
    expect(simulateMargin({ ownMargin: 120, gap: 16 })).toEqual({
      boxEnd: 466 - 120,
      addedRight: 0,
    });
    // Without gap, even with maximum edge mode, box ends at 382 and never overlaps the column.
    expect(
      simulateMargin({ ownMargin: 16, edges: { right: 'maximum' } })
    ).toEqual({
      boxEnd: 382,
      addedRight: 68,
    });
  });
});

describe('getTabBarEdge', () => {
  it('is the vertical bar edge on the iPhone Duo', () => {
    expect(getTabBarEdge(fixtures.iPhoneDuoOuterPortrait)).toBe('right');
    expect(getTabBarEdge(fixtures.iPhoneDuoOuterLandscape)).toBe('left');
  });

  it('is the bottom without a vertical bar', () => {
    expect(getTabBarEdge(fixtures.iPhoneDuoInnerPortrait)).toBe('bottom');
    expect(getTabBarEdge(fixtures.iPhone18ProPortrait)).toBe('bottom');
    expect(getTabBarEdge(fixtures.pixel10Landscape)).toBe('bottom');
    expect(getTabBarEdge(null)).toBe('bottom');
  });

  it('is the top of an iPad window of regular width', () => {
    expect(getTabBarEdge(fixtures.iPadProFullScreen)).toBe('top');
    expect(getTabBarEdge(fixtures.iPadProWindow)).toBe('bottom');
  });

  it('reads the idiom and size class the native side reports', () => {
    const metrics = parseMetrics(
      JSON.stringify({
        width: 834,
        height: 1210,
        insets: { top: 32, right: 0, bottom: 20, left: 0 },
        idiom: 'pad',
        horizontalSizeClass: 'regular',
      })
    );
    expect(metrics).toMatchObject({
      idiom: 'pad',
      horizontalSizeClass: 'regular',
    });
    expect(getTabBarEdge(metrics)).toBe('top');
  });
});
