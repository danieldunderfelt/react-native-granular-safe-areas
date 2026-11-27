import { deviceInfoEqual, getDeviceInfo, UNKNOWN_DEVICE } from '../device';
import { fixtures } from '../fixtures';
import { metricsFromInsets } from '../geometry';
import { parseMetrics } from '../metrics';
import type { GranularSafeAreaMetrics } from '../types';

describe('getDeviceInfo', () => {
  it('returns UNKNOWN_DEVICE when metrics are null', () => {
    expect(getDeviceInfo(null)).toBe(UNKNOWN_DEVICE);
    expect(
      getDeviceInfo(null, { platform: 'ios', model: 'iPhone19,4' })
    ).toEqual({
      ...UNKNOWN_DEVICE,
      platform: 'ios',
      model: 'iPhone19,4',
    });
  });

  it('classifies iPhone Duo outer (closed) fixtures as foldable / folded', () => {
    for (const fixture of [
      fixtures.iPhoneDuoOuterPortrait,
      fixtures.iPhoneDuoOuterPortraitWithTabBar,
      fixtures.iPhoneDuoOuterPortraitWithNativeHeader,
      fixtures.iPhoneDuoOuterLandscape,
    ]) {
      expect(getDeviceInfo(fixture)).toEqual({
        type: 'foldable',
        posture: 'folded',
        platform: 'ios',
        hasVerticalBar: true,
        verticalBarEdge:
          fixture === fixtures.iPhoneDuoOuterLandscape ? 'left' : 'right',
        hasFold: false,
        isFoldActive: false,
        granularSupported: true,
        model: null,
        systemVersion: null,
        idiom: null,
      });
    }
  });

  it('classifies iPhone Duo inner fixtures as foldable with unfolded / half-opened postures', () => {
    expect(getDeviceInfo(fixtures.iPhoneDuoInnerLandscape)).toMatchObject({
      type: 'foldable',
      posture: 'unfolded',
      hasVerticalBar: false,
      verticalBarEdge: null,
      hasFold: true,
      isFoldActive: false,
      granularSupported: true,
    });

    expect(
      getDeviceInfo({
        ...fixtures.iPhoneDuoInnerLandscape,
        tabBarEdge: 'right',
      })
    ).toMatchObject({
      type: 'foldable',
      posture: 'unfolded',
      hasVerticalBar: true,
      verticalBarEdge: 'right',
    });

    expect(getDeviceInfo(fixtures.iPhoneDuoInnerBookFold)).toMatchObject({
      type: 'foldable',
      posture: 'half-opened',
      hasVerticalBar: false,
      verticalBarEdge: null,
      hasFold: true,
      isFoldActive: true,
      granularSupported: true,
    });

    expect(getDeviceInfo(fixtures.iPhoneDuoInnerPortrait)).toMatchObject({
      type: 'foldable',
      posture: 'unfolded',
      hasVerticalBar: false,
      verticalBarEdge: null,
      hasFold: true,
      isFoldActive: false,
      granularSupported: true,
    });
  });

  it('classifies a regular iPhone and iPads accurately', () => {
    expect(
      getDeviceInfo({
        ...fixtures.iPhone18ProPortrait,
        idiom: 'phone',
        deviceModel: 'iPhone19,2',
        systemVersion: '27.2',
      })
    ).toEqual({
      type: 'phone',
      posture: 'standard',
      platform: 'ios',
      hasVerticalBar: false,
      verticalBarEdge: null,
      hasFold: false,
      isFoldActive: false,
      granularSupported: true,
      model: 'iPhone19,2',
      systemVersion: '27.2',
      idiom: 'phone',
    });

    expect(
      getDeviceInfo({
        ...fixtures.iPadProFullScreen,
        systemVersion: '27.0',
      })
    ).toMatchObject({
      type: 'tablet',
      posture: 'standard',
      idiom: 'pad',
      granularSupported: true,
    });

    expect(getDeviceInfo(fixtures.iPadProWindow)).toMatchObject({
      type: 'tablet',
      posture: 'windowed',
      idiom: 'pad',
      granularSupported: true,
    });
  });

  it('classifies Android phones, tablets, desktop windows, and foldables', () => {
    expect(getDeviceInfo(fixtures.pixel10Portrait)).toMatchObject({
      type: 'phone',
      posture: 'standard',
      platform: 'android',
      granularSupported: true,
    });
    expect(getDeviceInfo(fixtures.pixel10Landscape)).toMatchObject({
      type: 'phone',
      posture: 'standard',
      platform: 'android',
      granularSupported: true,
    });

    const androidTablet: GranularSafeAreaMetrics = {
      ...fixtures.pixel10Portrait,
      width: 800,
      height: 1280,
      idiom: 'pad',
    };
    expect(getDeviceInfo(androidTablet)).toMatchObject({
      type: 'tablet',
      posture: 'standard',
      idiom: 'pad',
      granularSupported: true,
    });

    const androidWindowedTablet: GranularSafeAreaMetrics = {
      ...androidTablet,
      insets: { top: 42, right: 0, bottom: 0, left: 0 },
      systemBars: [{ x: 680, y: 0, width: 120, height: 42 }],
      android: {
        bars: { top: 0, right: 0, bottom: 0, left: 0 },
        caption: { top: 42, right: 0, bottom: 0, left: 0 },
        cutout: { top: 0, right: 0, bottom: 0, left: 0 },
        captionTransparent: true,
        corners: [],
      },
    };
    expect(getDeviceInfo(androidWindowedTablet)).toMatchObject({
      type: 'tablet',
      posture: 'windowed',
      granularSupported: true,
    });

    const androidDesktop: GranularSafeAreaMetrics = {
      ...androidWindowedTablet,
      idiom: undefined,
    };
    expect(getDeviceInfo(androidDesktop)).toMatchObject({
      type: 'desktop',
      posture: 'windowed',
      granularSupported: true,
    });

    const androidFoldable: GranularSafeAreaMetrics = {
      ...fixtures.pixel10Portrait,
      width: 840,
      height: 840,
      divisions: [{ x: 420, y: 0, width: 0, height: 840, active: true }],
    };
    expect(getDeviceInfo(androidFoldable)).toMatchObject({
      type: 'foldable',
      posture: 'half-opened',
      hasFold: true,
      isFoldActive: true,
    });
  });

  it('classifies web and respects fallbackToBands', () => {
    const web = metricsFromInsets(
      1024,
      768,
      { top: 0, right: 0, bottom: 0, left: 0 },
      'web'
    );
    expect(getDeviceInfo(web)).toMatchObject({
      type: 'web',
      posture: 'standard',
      platform: 'web',
      granularSupported: false,
    });

    expect(
      getDeviceInfo(fixtures.iPhoneDuoOuterPortrait, { fallbackToBands: true })
    ).toMatchObject({
      type: 'foldable',
      posture: 'folded',
      granularSupported: false,
    });
  });

  it('parses optional deviceModel and systemVersion in parseMetrics without altering fixtures', () => {
    const parsed = parseMetrics(
      JSON.stringify({
        ...fixtures.iPhoneDuoOuterPortrait,
        deviceModel: 'iPhone19,4',
        systemVersion: '27.2',
      })
    );
    expect(parsed?.deviceModel).toBe('iPhone19,4');
    expect(parsed?.systemVersion).toBe('27.2');

    const a = getDeviceInfo(parsed);
    const b = getDeviceInfo(parsed);
    expect(deviceInfoEqual(a, b)).toBe(true);
    expect(
      deviceInfoEqual(a, getDeviceInfo(parsed, { fallbackToBands: true }))
    ).toBe(false);
  });
});
