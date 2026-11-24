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
  GranularSafeAreaProvider,
  mockSafeAreaMetrics,
  SystemBackButton,
  useSafeAreaInsetsFor,
  useSystemControls,
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

function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

function Probe({ onRender }: { onRender: (value: unknown) => void }) {
  onRender({
    edge: useTabBarEdge(),
    controls: useSystemControls()?.edge ?? null,
    header: useSafeAreaInsetsFor({ top: 0, height: 56 }, { granular: true })
      .right,
  });
  return null;
}

afterEach(() => mockSafeAreaMetrics(null));

describe('the Jest mock', () => {
  it('has nothing to avoid by default', () => {
    const seen = jest.fn();
    render(<Probe onRender={seen} />);
    expect(seen).toHaveBeenLastCalledWith({
      edge: 'bottom',
      controls: null,
      header: 0,
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
    });
  });

  it('lays out for a fixture everywhere with mockSafeAreaMetrics', () => {
    mockSafeAreaMetrics(fixtures.iPadProFullScreen);
    const seen = jest.fn();
    render(<Probe onRender={seen} />);
    expect(seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ edge: 'top' })
    );
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
});

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'mine-back-button': {};
    }
  }
}
