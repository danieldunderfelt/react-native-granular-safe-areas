import { act, create } from 'react-test-renderer';
import { GranularSafeAreaContext } from '../context';
import { fixtures } from '../fixtures';
import { buildRegions } from '../geometry';
import { GranularSafeAreaStore } from '../store';
import {
  shapeKey,
  useSystemHeaderItemsFor,
  withLatestHandlers,
  type SystemHeaderItemsOptions,
} from '../systemHeader';
import type { GranularSafeAreaMetrics } from '../types';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  View: 'View',
  Pressable: 'Pressable',
  Dimensions: {
    get: () => ({ width: 0, height: 0 }),
    addEventListener: () => ({ remove() {} }),
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
}));

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

type Item = { type: 'button'; label: string; onPress: () => void };

function storeFor(metrics: GranularSafeAreaMetrics) {
  const store = new GranularSafeAreaStore(
    () => null,
    () => {}
  );
  store.publish(
    buildRegions(metrics),
    metrics,
    buildRegions(metrics, { granular: false })
  );
  return store;
}

function Screen({
  navigation,
  options,
  onResult,
}: {
  navigation: { setOptions: jest.Mock };
  options: SystemHeaderItemsOptions<Item, Record<string, unknown>>;
  onResult: (shown: boolean) => void;
}) {
  onResult(useSystemHeaderItemsFor(navigation, options).shown);
  return null;
}

function setup(metrics: GranularSafeAreaMetrics) {
  const store = storeFor(metrics);
  const navigation = { setOptions: jest.fn() };
  const shown = jest.fn();
  let renderer!: ReturnType<typeof create>;
  const render = (
    options: SystemHeaderItemsOptions<Item, Record<string, unknown>> | null
  ) =>
    act(() => {
      const element = (
        <GranularSafeAreaContext.Provider value={store}>
          {options ? (
            <Screen
              navigation={navigation}
              options={options}
              onResult={shown}
            />
          ) : null}
        </GranularSafeAreaContext.Provider>
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  return { store, navigation, shown, render };
}

const lastOptions = (navigation: { setOptions: jest.Mock }) =>
  navigation.setOptions.mock.calls.at(-1)![0] as Record<string, unknown>;

describe('useSystemHeaderItems', () => {
  it('gives the screen a transparent, empty native header with the items on the iPhone Duo', () => {
    const onPress = jest.fn();
    const { navigation, shown, render } = setup(
      fixtures.iPhoneDuoOuterPortrait
    );
    render({ headerRightItems: [{ type: 'button', label: 'Share', onPress }] });
    expect(shown).toHaveBeenLastCalledWith(true);
    const options = lastOptions(navigation);
    expect(options).toMatchObject({
      headerShown: true,
      headerTransparent: true,
      title: '',
      headerBackVisible: true,
      scrollEdgeEffects: { top: 'hidden' },
    });
    const items = (options.unstable_headerRightItems as () => Item[])();
    expect(items).toEqual([
      { type: 'button', label: 'Share', onPress: expect.any(Function) },
    ]);
    items[0]!.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the fallback where the system has no place for its controls', () => {
    const { navigation, shown, render } = setup(fixtures.iPhone18ProPortrait);
    render({
      headerRightItems: [{ type: 'button', label: 'Share', onPress() {} }],
    });
    expect(shown).toHaveBeenLastCalledWith(false);
    expect(lastOptions(navigation)).toMatchObject({ headerShown: false });
    expect(lastOptions(navigation)).toHaveProperty(
      'headerTransparent',
      undefined
    );
    expect(lastOptions(navigation)).toHaveProperty(
      'unstable_headerRightItems',
      undefined
    );
  });

  it('applies a fallback of your own, and turns off with enabled', () => {
    const { navigation, shown, render } = setup(
      fixtures.iPhoneDuoOuterPortrait
    );
    render({ enabled: false, fallback: { headerShown: true, title: 'Trip' } });
    expect(shown).toHaveBeenLastCalledWith(false);
    expect(lastOptions(navigation)).toMatchObject({
      headerShown: true,
      title: 'Trip',
      headerTransparent: undefined,
    });
  });

  it('switches when the system UI changes, such as the Duo opening', () => {
    const { store, navigation, shown, render } = setup(
      fixtures.iPhoneDuoOuterPortrait
    );
    render({});
    expect(shown).toHaveBeenLastCalledWith(true);
    const opened = fixtures.iPhoneDuoInnerPortrait;
    act(() =>
      store.publish(
        buildRegions(opened),
        opened,
        buildRegions(opened, { granular: false })
      )
    );
    expect(shown).toHaveBeenLastCalledWith(false);
    expect(lastOptions(navigation)).toMatchObject({ headerShown: false });
  });

  it('sets the header again only when what it shows changes, and calls the latest handlers', () => {
    const { navigation, render } = setup(fixtures.iPhoneDuoOuterPortrait);
    const first = jest.fn();
    const second = jest.fn();
    render({
      headerRightItems: [{ type: 'button', label: 'Share', onPress: first }],
    });
    render({
      headerRightItems: [{ type: 'button', label: 'Share', onPress: second }],
    });
    expect(navigation.setOptions).toHaveBeenCalledTimes(1);
    const items = (
      lastOptions(navigation).unstable_headerRightItems as () => Item[]
    )();
    items[0]!.onPress();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    render({
      headerRightItems: [{ type: 'button', label: 'Save', onPress: second }],
    });
    expect(navigation.setOptions).toHaveBeenCalledTimes(2);
  });
});

describe('useSystemHeaderItems going away', () => {
  it('takes the native header off when it unmounts while the screen stays', () => {
    const { navigation, render } = setup(fixtures.iPhoneDuoOuterPortrait);
    render({
      headerRightItems: [{ type: 'button', label: 'Share', onPress() {} }],
      fallback: { headerShown: true, title: 'Trip' },
    });
    expect(lastOptions(navigation)).toMatchObject({ headerTransparent: true });
    render(null);
    expect(navigation.setOptions).toHaveBeenCalledTimes(2);
    expect(lastOptions(navigation)).toMatchObject({
      headerShown: true,
      title: 'Trip',
      headerTransparent: undefined,
      unstable_headerRightItems: undefined,
    });
  });

  it('leaves the fallback alone when it unmounts without the native header', () => {
    const { navigation, render } = setup(fixtures.iPhone18ProPortrait);
    render({});
    render(null);
    expect(navigation.setOptions).toHaveBeenCalledTimes(1);
  });
});

describe('shapeKey', () => {
  it('ignores handlers and sees everything else', () => {
    const a = shapeKey([
      { label: 'A', onPress: () => 1, menu: { items: [{ onPress() {} }] } },
    ]);
    const b = shapeKey([
      { label: 'A', onPress: () => 2, menu: { items: [{ onPress() {} }] } },
    ]);
    expect(a).toBe(b);
    expect(shapeKey([{ label: 'B', onPress: () => 1 }])).not.toBe(a);
  });

  it('describes React elements without walking into them', () => {
    const element = {
      $$typeof: Symbol.for('react.element'),
      type: 'View',
      key: 'x',
      props: {},
    };
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    (element as Record<string, unknown>)._owner = circular;
    expect(shapeKey([{ element }])).toContain('[element View x]');
  });
});

describe('withLatestHandlers', () => {
  it('calls the handler at the same place in the latest items, nested ones too', () => {
    const old = jest.fn();
    const next = jest.fn();
    let latest: unknown[] = [{ menu: { items: [{ onPress: old }] } }];
    const wrapped = withLatestHandlers(latest, () => latest) as {
      menu: { items: { onPress: () => void }[] };
    }[];
    latest = [{ menu: { items: [{ onPress: next }] } }];
    wrapped[0]!.menu.items[0]!.onPress();
    expect(next).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });
});
