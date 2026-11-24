import { fixtures } from '../fixtures';
import { buildRegions, getTabBarEdge, safeAreaViewInsets } from '../geometry';
import { parseMetrics } from '../metrics';
import { mergeDefaults, resolveSafeAreaProps } from '../resolveProps';

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
