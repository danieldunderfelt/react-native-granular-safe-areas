jest.mock('react-native', () => {
  const { createElement } = jest.requireActual('react');
  const host =
    (name: string) =>
    (props: Record<string, unknown>): unknown =>
      createElement(name, props);
  return { View: host('View'), Pressable: host('Pressable') };
});
jest.mock('react-native-safe-area-context', () => ({}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  fixtures,
  getSystemHeaderItems,
  GranularSafeAreaProvider,
  mockSafeAreaMetrics,
  SafeAreaAccessory,
  SafeAreaDefaults,
  SafeAreaView,
  SystemBackButton,
  useSafeAreaDevice,
  useSafeAreaDiagnostics,
  useSafeAreaInsetsFor,
  useSafeAreaStyle,
  useSafeAreaViewInsets,
  useSafeAreaViewStyle,
  useSystemControls,
  useSystemHeaderItems,
  useTabBarEdge,
} from '../jest';

// react-test-renderer is deprecated, but it's the lightest way to run hooks in Jest here.
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: ReactTestRenderer[] = [];

function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  mounted.push(renderer);
  return renderer;
}

function Probe({ onRender }: { onRender: (value: unknown) => void }) {
  onRender({
    edge: useTabBarEdge(),
    controls: useSystemControls()?.edge ?? null,
    header: useSafeAreaInsetsFor({ top: 0, height: 56 }, { granular: true })
      .right,
    deviceType: useSafeAreaDevice().type,
    devicePosture: useSafeAreaDevice().posture,
  });
  return null;
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
  mockSafeAreaMetrics(null);
});

describe('the Jest mock', () => {
  it('has nothing to avoid by default', () => {
    const seen = jest.fn();
    render(<Probe onRender={seen} />);
    expect(seen).toHaveBeenLastCalledWith({
      edge: 'bottom',
      controls: null,
      header: 0,
      deviceType: 'unknown',
      devicePosture: 'standard',
    });
  });

  it('lays out for a fixture in a provider', () => {
    const seen = jest.fn();
    render(
      <GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>
        <Probe onRender={seen} />
      </GranularSafeAreaProvider>
    );
    expect(seen).toHaveBeenLastCalledWith({
      edge: 'right',
      controls: 'right',
      header: 84,
      deviceType: 'foldable',
      devicePosture: 'folded',
    });
  });

  it('lays out for a fixture everywhere with mockSafeAreaMetrics', () => {
    mockSafeAreaMetrics(fixtures.iPadProFullScreen);
    const seen = jest.fn();
    render(<Probe onRender={seen} />);
    expect(seen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        edge: 'top',
        deviceType: 'tablet',
        devicePosture: 'standard',
      })
    );
  });

  it('provides a no-op useSafeAreaDiagnostics stand-in in Jest', async () => {
    mockSafeAreaMetrics(fixtures.iPhoneDuoInnerBookFold);
    const onCheck = jest.fn();
    let diag!: ReturnType<typeof useSafeAreaDiagnostics>;
    function DiagProbe() {
      diag = useSafeAreaDiagnostics({ onCheck });
      return null;
    }
    render(<DiagProbe />);
    expect(diag.report).toBeNull();
    expect(diag.fallbackActive).toBe(false);
    const result = await diag.checkNow();
    expect(result.ok).toBe(true);
    expect(result.device).toMatchObject({
      type: 'foldable',
      posture: 'half-opened',
    });
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('shows your own back button where the system has no place for one', () => {
    const tree = render(
      <SystemBackButton onPress={() => {}}>
        <mine-back-button />
      </SystemBackButton>
    );
    expect(tree.root.findAllByType('mine-back-button' as never)).toHaveLength(
      1
    );
    expect(
      tree.root.findAllByProps({ testID: 'SystemBackButton' })
    ).toHaveLength(0);
  });

  it('shows the system back button on the iPhone Duo, pressing the latest screen', () => {
    const first = jest.fn();
    const second = jest.fn();
    const tree = render(
      <GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>
        <SystemBackButton onPress={first}>
          <mine-back-button />
        </SystemBackButton>
        <SystemBackButton onPress={second} keepSpace>
          <mine-back-button />
        </SystemBackButton>
      </GranularSafeAreaProvider>
    );
    const buttons = tree.root.findAll(
      (node) =>
        node.props.testID === 'SystemBackButton' &&
        typeof node.type === 'string'
    );
    expect(buttons).toHaveLength(1);
    act(() => buttons[0]!.props.onPress());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    // The first screen's own button stays; the second's keeps its space, hidden.
    const own = tree.root.findAllByType('mine-back-button' as never);
    expect(own).toHaveLength(2);
    expect(own[1]!.parent!.props).toMatchObject({
      style: { opacity: 0 },
      pointerEvents: 'none',
    });
  });

  it('tells which icon the system would draw', () => {
    const tree = render(
      <GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>
        <SystemBackButton onPress={() => {}} icon="close" />
      </GranularSafeAreaProvider>
    );
    const [button] = tree.root.findAll(
      (node) =>
        node.props.testID === 'SystemBackButton' &&
        typeof node.type === 'string'
    );
    expect(button!.props).toMatchObject({
      icon: 'close',
      systemImage: 'xmark',
      accessibilityLabel: 'Close',
    });
  });

  it('keeps bottom tab bar and custom back buttons on Duo open in landscape while still reporting the status strip', () => {
    const seen = jest.fn();
    const tree = render(
      <GranularSafeAreaProvider mock={fixtures.iPhoneDuoInnerLandscape}>
        <Probe onRender={seen} />
        <SystemBackButton onPress={() => {}}>
          <mine-back-button />
        </SystemBackButton>
        <HeaderScreen onShare={() => {}} />
      </GranularSafeAreaProvider>
    );
    expect(seen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        edge: 'bottom',
        controls: 'right',
        deviceType: 'foldable',
        devicePosture: 'unfolded',
      })
    );
    // Both SystemBackButton and HeaderScreen keep the app's own back button visible.
    expect(tree.root.findAllByType('mine-back-button' as never)).toHaveLength(
      2
    );
    expect(
      tree.root.findAllByProps({ testID: 'SystemBackButton' })
    ).toHaveLength(0);
    expect(getSystemHeaderItems()).toBeNull();
  });

  it('gives way when disabled', () => {
    const tree = render(
      <GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>
        <SystemBackButton onPress={() => {}} enabled={false}>
          <mine-back-button />
        </SystemBackButton>
      </GranularSafeAreaProvider>
    );
    expect(tree.root.findAllByType('mine-back-button' as never)).toHaveLength(
      1
    );
  });

  it('applies band insets in SafeAreaView, SafeAreaAccessory, SafeAreaDefaults and hooks when metrics are mocked', () => {
    const hostByTestId = (tree: ReactTestRenderer, testID: string) =>
      tree.root.find(
        (node) => node.props.testID === testID && typeof node.type === 'string'
      );

    const onInsets = jest.fn();
    // Without mocked metrics: untouched plain View, no onInsetsChange.
    const plain = render(
      <SafeAreaView
        testID="plain"
        edges={['right']}
        gap={16}
        style={{ paddingRight: 16 }}
        onInsetsChange={onInsets}
      />
    );
    expect(hostByTestId(plain, 'plain').props.style).toEqual({
      paddingRight: 16,
    });
    expect(onInsets).not.toHaveBeenCalled();
    act(() => plain.unmount());

    // With Duo metrics: band padding, margin (with gap), offset, mode="none", SafeAreaDefaults, and hooks.
    mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait);
    const seen = jest.fn();
    function ChildReader() {
      seen({
        insets: useSafeAreaViewInsets(),
        contentStyle: useSafeAreaViewStyle({
          paddingHorizontal: 16,
          paddingBottom: 24,
        }),
        largeContentStyle: useSafeAreaViewStyle({ paddingRight: 120 }),
        marginStyle: useSafeAreaViewStyle(
          { marginRight: 16 },
          { mode: 'margin' }
        ),
      });
      return null;
    }
    let hookStyle!: ReturnType<typeof useSafeAreaStyle>;
    const onStyleInsets = jest.fn();
    function StyleHookProbe() {
      hookStyle = useSafeAreaStyle({
        edges: ['right'],
        gap: 16,
        style: { paddingRight: 16 },
        onInsetsChange: onStyleInsets,
      });
      return hookStyle.probe;
    }

    const onNoneInsets = jest.fn();
    const tree = render(
      <SafeAreaDefaults edges={['left', 'right']} gap={16}>
        <SafeAreaView testID="pad" style={{ paddingHorizontal: 16 }} />
        <SafeAreaView
          testID="margin"
          mode="margin"
          style={{ marginRight: 16 }}
        />
        <SafeAreaView
          testID="margin-clear"
          mode="margin"
          style={{ marginRight: 120 }}
        />
        <SafeAreaView testID="offset" mode="offset" gap={0} />
        <SafeAreaView
          testID="none"
          mode="none"
          edges={['right', 'bottom']}
          onInsetsChange={onNoneInsets}
        >
          <ChildReader />
        </SafeAreaView>
        <SafeAreaAccessory testID="accessory" style={{ paddingRight: 8 }} />
        <StyleHookProbe />
      </SafeAreaDefaults>
    );

    expect(hostByTestId(tree, 'pad').props.style).toEqual([
      { paddingHorizontal: 16 },
      { paddingRight: 100 },
    ]);
    expect(hostByTestId(tree, 'margin').props.style).toEqual([
      { marginRight: 16 },
      { marginRight: 100 },
    ]);
    expect(hostByTestId(tree, 'margin-clear').props.style).toEqual({
      marginRight: 120,
    });
    expect(hostByTestId(tree, 'offset').props.style).toEqual([
      undefined,
      { transform: [{ translateX: -84 }, { translateY: 0 }] },
    ]);
    expect(hostByTestId(tree, 'none').props.style).toBeUndefined();
    expect(onNoneInsets).toHaveBeenLastCalledWith({
      top: 0,
      right: 100,
      bottom: 50,
      left: 0,
    });
    expect(seen).toHaveBeenLastCalledWith({
      insets: { top: 0, right: 100, bottom: 50, left: 0 },
      contentStyle: { paddingRight: 100, paddingBottom: 50 },
      largeContentStyle: { paddingBottom: 50 },
      marginStyle: { marginRight: 100, marginBottom: 50 },
    });
    expect(hostByTestId(tree, 'accessory').props.style).toEqual([
      { paddingRight: 8 },
      { paddingRight: 100 },
    ]);
    expect(hookStyle.style).toEqual({ paddingRight: 100 });
    expect(hookStyle.insets).toEqual({
      top: 0,
      right: 100,
      bottom: 0,
      left: 0,
    });
    expect(onStyleInsets).toHaveBeenLastCalledWith({
      top: 0,
      right: 100,
      bottom: 0,
      left: 0,
    });
  });

  it('reports hasVerticalBar / verticalBarEdge and systemControls.hasBars accurately for sheets', () => {
    const seen = jest.fn();
    function SheetProbe() {
      const device = useSafeAreaDevice();
      const controls = useSystemControls();
      seen({
        hasVerticalBar: device.hasVerticalBar,
        verticalBarEdge: device.verticalBarEdge,
        hasBars: controls?.hasBars ?? false,
      });
      return null;
    }

    mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait);
    render(<SheetProbe />);
    expect(seen).toHaveBeenLastCalledWith({
      hasVerticalBar: true,
      verticalBarEdge: 'right',
      hasBars: true,
    });

    act(() => mockSafeAreaMetrics(fixtures.iPhoneDuoInnerLandscape));
    expect(seen).toHaveBeenLastCalledWith({
      hasVerticalBar: false,
      verticalBarEdge: null,
      hasBars: false,
    });
  });
});

function HeaderScreen({
  onShare,
  enabled,
}: {
  onShare: () => unknown;
  enabled?: boolean;
}) {
  const { shown } = useSystemHeaderItems({
    enabled,
    headerRightItems: [{ type: 'button', label: 'Share', onPress: onShare }],
  });
  return shown ? null : <mine-back-button />;
}

describe('useSystemHeaderItems in the Jest mock', () => {
  it('has no items where the system has no place for them', () => {
    render(<HeaderScreen onShare={() => {}} />);
    expect(getSystemHeaderItems()).toBeNull();
  });

  it('gives the items to check and press on the iPhone Duo, with the latest handlers', () => {
    mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait);
    const first = jest.fn();
    const second = jest.fn();
    const tree = render(<HeaderScreen onShare={first} />);
    act(() => tree.update(<HeaderScreen onShare={second} />));
    const items = getSystemHeaderItems();
    expect(items).toMatchObject({
      headerRightItems: [{ type: 'button', label: 'Share' }],
      headerLeftItems: [],
      headerBackVisible: true,
    });
    act(() => {
      items!.headerRightItems[0]!.onPress!();
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    act(() => tree.update(<HeaderScreen onShare={second} enabled={false} />));
    expect(getSystemHeaderItems()).toBeNull();
    act(() => tree.update(<HeaderScreen onShare={second} />));
    expect(getSystemHeaderItems()).not.toBeNull();
    act(() => tree.unmount());
    expect(getSystemHeaderItems()).toBeNull();
  });

  it('keeps working in later renders after pressing an async handler in a synchronous act', async () => {
    mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait);
    const asyncShare = jest.fn(async () => {
      await Promise.resolve();
    });
    const first = render(<HeaderScreen onShare={asyncShare} />);
    const items = getSystemHeaderItems();
    expect(items).not.toBeNull();
    // Pressing an async handler in a synchronous `act` with an implicit return must not return a Promise to React 19's
    // `act`, which would otherwise leave `actScopeDepth` stuck and prevent later tests from running layout effects.
    act(() => items!.headerRightItems[0]!.onPress!());
    expect(asyncShare).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    act(() => first.unmount());
    mockSafeAreaMetrics(null);
    expect(getSystemHeaderItems()).toBeNull();

    mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait);
    const nextShare = jest.fn();
    render(<HeaderScreen onShare={nextShare} />);
    const nextItems = getSystemHeaderItems();
    expect(nextItems).not.toBeNull();
    act(() => {
      nextItems!.headerRightItems[0]!.onPress!();
    });
    expect(nextShare).toHaveBeenCalledTimes(1);
  });
});

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'mine-back-button': {};
    }
  }
}
