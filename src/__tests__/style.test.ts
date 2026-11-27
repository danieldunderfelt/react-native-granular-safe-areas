import { I18nManager } from 'react-native';
import { edgeModes } from '../geometry';
import { layoutAdjustment, ownEdges } from '../style';

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

const i18n = I18nManager as {
  isRTL: boolean;
  doLeftAndRightSwapInRTL: boolean;
};

const right = { top: 0, right: 84, bottom: 0, left: 0 };
const all = edgeModes(undefined);

afterEach(() => {
  i18n.isRTL = false;
  i18n.doLeftAndRightSwapInRTL = true;
});

describe('layoutAdjustment', () => {
  it('adds the inset to the padding on that edge', () => {
    expect(
      layoutAdjustment({ paddingRight: 16 }, right, 'padding', all)
    ).toEqual({
      style: { paddingRight: 100 },
      added: { top: 0, right: 84, bottom: 0, left: 0 },
    });
  });

  it('builds on the axis and all-edge shorthands', () => {
    expect(
      layoutAdjustment({ paddingHorizontal: 16 }, right, 'padding', all).style
    ).toEqual({ paddingRight: 100 });
    expect(
      layoutAdjustment({ padding: 8 }, right, 'padding', all).style
    ).toEqual({ paddingRight: 92 });
    expect(
      layoutAdjustment({ paddingInline: 12 }, right, 'padding', all).style
    ).toEqual({ paddingRight: 96 });
  });

  it('reads paddingEnd as the right edge, and writes there so it wins', () => {
    expect(
      layoutAdjustment(
        { paddingEnd: 16, paddingRight: 4 },
        right,
        'padding',
        all
      ).style
    ).toEqual({ paddingEnd: 100 });
    expect(
      layoutAdjustment({ paddingInlineEnd: 16 }, right, 'padding', all).style
    ).toEqual({ paddingInlineEnd: 100 });
  });

  it('takes the larger value with maximum', () => {
    const maximum = edgeModes({ right: 'maximum' });
    expect(
      layoutAdjustment({ paddingRight: 100 }, right, 'padding', maximum)
    ).toEqual({ style: null, added: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(
      layoutAdjustment({ paddingRight: 16 }, right, 'padding', maximum).style
    ).toEqual({ paddingRight: 84 });
  });

  it('applies margins, adding the overlap measured inside the view’s own margin even with maximum', () => {
    expect(
      layoutAdjustment({ marginStart: 4, marginEnd: 8 }, right, 'margin', all)
        .style
    ).toEqual({ marginEnd: 92 });

    // With marginRight: 16 and gap: 16 against an 84 pt column, the box at 450 overlaps the 100 pt zone by 84 pt.
    // Adding 84 to the view's own 16 gives marginRight: 100 (ending 16 pt from the column) instead of max(16, 84) = 84.
    const maximum = edgeModes({ right: 'maximum' });
    expect(
      layoutAdjustment({ marginHorizontal: 16 }, right, 'margin', maximum)
    ).toEqual({
      style: { marginRight: 100 },
      added: { top: 0, right: 84, bottom: 0, left: 0 },
    });

    // Without gap, the box at 450 overlaps the 84 pt column by 68 pt: 16 + 68 = 84 clears the column instead of 68.
    const overlap = { top: 0, right: 68, bottom: 0, left: 0 };
    expect(
      layoutAdjustment({ marginRight: 16 }, overlap, 'margin', maximum)
    ).toEqual({
      style: { marginRight: 84 },
      added: { top: 0, right: 68, bottom: 0, left: 0 },
    });
  });

  describe('right to left', () => {
    it('reads paddingStart as the right edge', () => {
      i18n.isRTL = true;
      i18n.doLeftAndRightSwapInRTL = false;
      expect(
        layoutAdjustment({ paddingStart: 16 }, right, 'padding', all).style
      ).toEqual({ paddingStart: 100 });
      // paddingRight stays physical without the swap.
      expect(
        layoutAdjustment({ paddingRight: 16 }, right, 'padding', all).style
      ).toEqual({ paddingRight: 100 });
    });

    it('writes the right edge to paddingLeft where React Native swaps left and right', () => {
      i18n.isRTL = true;
      expect(layoutAdjustment({}, right, 'padding', all).style).toEqual({
        paddingLeft: 84,
      });
      expect(
        layoutAdjustment({ paddingLeft: 16 }, right, 'padding', all).style
      ).toEqual({ paddingLeft: 100 });
      // `paddingRight` is the left edge then, so it doesn't count.
      expect(
        layoutAdjustment({ paddingRight: 16 }, right, 'padding', all).style
      ).toEqual({ paddingLeft: 84 });
    });

    it('follows a view that sets its own direction', () => {
      expect(
        ownEdges({ direction: 'rtl', paddingStart: 10 }, 'padding')
      ).toMatchObject({
        right: { value: 10, key: 'paddingStart' },
        left: { value: undefined, key: 'paddingLeft' },
      });
    });
  });
});
