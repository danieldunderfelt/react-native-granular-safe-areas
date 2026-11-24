import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { getVerticalBar } from './geometry';
import { useGranularSafeAreaStore } from './hooks';

/** What the hook needs from a navigation object: React Navigation's and Expo Router's both have it. */
export type HeaderNavigation = { setOptions(options: object): void };

export type SystemHeaderItemsOptions<Item, Options> = {
  /**
   * Items for the system's controls, as for `unstable_headerRightItems`: buttons, menus and spacing, with SF Symbols,
   * badges and the rest. On the iPhone Duo they go in the vertical bar, below the back button.
   */
  headerRightItems?: readonly Item[];
  /** Items as for `unstable_headerLeftItems`. */
  headerLeftItems?: readonly Item[];
  /**
   * Show UIKit's back button where there's a screen to go back to. Defaults to `true`. It pops the screen natively; use
   * React Navigation's `usePreventRemove` to intercept it.
   */
  headerBackVisible?: boolean;
  /**
   * The screen's header options where the system has no place for its controls (everywhere except the iPhone Duo
   * closed, or open in landscape). Defaults to `{ headerShown: false }`: your own header.
   */
  fallback?: Partial<Options>;
  /** `false` always uses `fallback`. Defaults to `true`. */
  enabled?: boolean;
};

export type SystemHeaderItemsResult = {
  /**
   * `true` while the system shows the back button and the items in its own controls. Hide your own back button and
   * header buttons then: the screen has a native header, transparent and empty, whose controls UIKit puts in the
   * vertical bar.
   */
  shown: boolean;
};

/**
 * The options that make a native-stack header transparent and empty, so only the controls UIKit takes out of it are
 * left: on the iPhone Duo, the back button and the items in the vertical bar. Touches go through the empty bar.
 */
const NATIVE_HEADER = {
  headerShown: true,
  headerTransparent: true,
  title: '',
  headerTitle: '',
  headerLargeTitleEnabled: false,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  headerStyle: { backgroundColor: 'transparent' },
  headerBlurEffect: 'none',
  scrollEdgeEffects: { top: 'hidden' },
  headerLeft: undefined,
  headerRight: undefined,
  headerBackground: undefined,
  headerSearchBarOptions: undefined,
} as const;

const DEFAULT_FALLBACK = { headerShown: false };

/** Every key the native header sets, so switching to the fallback leaves none of them behind. */
const NATIVE_KEYS = [
  ...Object.keys(NATIVE_HEADER),
  'headerBackVisible',
  'unstable_headerRightItems',
  'unstable_headerLeftItems',
];

/**
 * Whether the system has a place for header controls where the screen is: the iPhone Duo's vertical bar. Only iOS
 * draws UIKit's bar items there; a mocked Duo layout elsewhere doesn't count.
 */
function useHasVerticalBar(): boolean {
  const store = useGranularSafeAreaStore();
  return useSyncExternalStore(store.subscribe, () => {
    const { metrics } = store.getSnapshot();
    return (
      Platform.OS === 'ios' &&
      metrics !== null &&
      getVerticalBar(metrics) !== null
    );
  });
}

/**
 * The shared implementation of `useSystemHeaderItems` for React Navigation and Expo Router: both take the same
 * native-stack options, through their own `navigation`.
 */
export function useSystemHeaderItemsFor<Item, Options>(
  navigation: HeaderNavigation,
  {
    headerRightItems,
    headerLeftItems,
    headerBackVisible = true,
    fallback,
    enabled = true,
  }: SystemHeaderItemsOptions<Item, Options>
): SystemHeaderItemsResult {
  const hasVerticalBar = useHasVerticalBar();
  const shown = enabled && hasVerticalBar;

  // The latest items and fallback, for handlers called after they were set. The header is only set again when what
  // it shows changes, so inline items and handlers don't set it on every render.
  const latest = useRef({ headerRightItems, headerLeftItems, fallback });
  useLayoutEffect(() => {
    latest.current = { headerRightItems, headerLeftItems, fallback };
  });
  const rightKey = shapeKey(headerRightItems);
  const leftKey = shapeKey(headerLeftItems);
  const fallbackKey = shapeKey(fallback);

  // In a layout effect, so the header is right before the screen is first drawn.
  useLayoutEffect(() => {
    const items = (key: 'headerRightItems' | 'headerLeftItems') => {
      if (!latest.current[key]) return undefined;
      const current = withLatestHandlers(
        latest.current[key] as readonly unknown[],
        () => latest.current[key] as readonly unknown[] | undefined
      );
      return () => current;
    };
    if (shown) {
      navigation.setOptions({
        ...NATIVE_HEADER,
        headerBackVisible,
        unstable_headerRightItems: items('headerRightItems'),
        unstable_headerLeftItems: items('headerLeftItems'),
      });
    } else {
      const reset: Record<string, unknown> = {};
      for (const key of NATIVE_KEYS) reset[key] = undefined;
      navigation.setOptions({
        ...reset,
        ...(latest.current.fallback ?? DEFAULT_FALLBACK),
      });
    }
  }, [navigation, shown, headerBackVisible, rightKey, leftKey, fallbackKey]);

  return { shown };
}

/**
 * What items or options show, as a string: everything but their functions (handlers), which are called through to
 * the latest ones instead. React elements count by their type and key.
 */
export function shapeKey(value: unknown): string {
  const elements = new Map<unknown, number>();
  return (
    JSON.stringify(value ?? null, (_key, v: unknown) => {
      if (typeof v === 'function') return '[function]';
      if (isElement(v)) {
        const type = v.type as { displayName?: string; name?: string } | string;
        let id = elements.get(v.type);
        if (id === undefined) elements.set(v.type, (id = elements.size));
        return `[element ${typeof type === 'string' ? type : (type?.displayName ?? type?.name ?? id)} ${String(v.key)}]`;
      }
      return v;
    }) ?? ''
  );
}

function isElement(value: unknown): value is { type: unknown; key: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    'type' in value
  );
}

/**
 * A copy of `items` whose functions call the function at the same place in `latest()`, so a handler set once still
 * runs the most recent code. Falls back to the original where the latest items no longer have one there.
 */
export function withLatestHandlers<T>(
  items: readonly T[],
  latest: () => readonly unknown[] | undefined
): T[] {
  const copy = (value: unknown, path: (string | number)[]): unknown => {
    if (typeof value === 'function') {
      const original = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        let current: unknown = latest();
        for (const step of path) {
          current =
            current != null
              ? (current as Record<string | number, unknown>)[step]
              : undefined;
        }
        return (typeof current === 'function' ? current : original)(...args);
      };
    }
    if (Array.isArray(value)) {
      return value.map((item, index) => copy(item, [...path, index]));
    }
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = copy(item, [...path, key]);
      }
      return out;
    }
    return value;
  };
  return items.map((item, index) => copy(item, [index]) as T);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || isElement(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
