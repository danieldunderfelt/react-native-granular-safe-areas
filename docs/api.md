# API reference

Everything the package exports, by entry point. The [README](../README.md) explains when to use what.

| Entry point | For |
| --- | --- |
| `react-native-granular-safe-areas` | Apps: components, hooks, and everything from react-native-safe-area-context |
| `react-native-granular-safe-areas/reanimated` | `AnimatedSafeAreaView`. Needs `react-native-reanimated` 4 and `react-native-worklets` |
| `react-native-granular-safe-areas/jest` | A stand-in for the main entry in Jest tests |
| `react-native-granular-safe-areas/testing` | The geometry, metrics and store behind the components, for tests and tools |

## Main entry

Everything from `react-native-safe-area-context` (`SafeAreaProvider`, `useSafeAreaInsets`, `useSafeAreaFrame`,
`initialWindowMetrics`, ...) is re-exported unchanged, except `SafeAreaView`, which is this library's.

### `SafeAreaView`

A drop-in for react-native-safe-area-context's `SafeAreaView`. Takes `ViewProps`, plus:

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `edges` | `Edges` | all four, additive | Edges the view may be pushed in from: a list, or `{ top: 'additive' \| 'maximum' \| 'off', ... }` |
| `mode` | `'padding' \| 'margin' \| 'offset' \| 'none'` | `'padding'` | How the insets are applied |
| `granular` | `boolean` | `false` | Avoid only the regions the view overlaps where it's laid out, not whole bands |
| `dynamic` | `boolean` | `false` | Follow the view as it moves, avoiding only what it overlaps right now. Implies `granular` |
| `avoid` | `readonly SafeAreaRegionKind[]` | all but `'fold'` | Region kinds to avoid. `[]` avoids nothing |
| `spacing` | `number` | `0` | Extra clearance around each region, in points |
| `gap` | `number` | | Keep the content this far from what it avoids, counting the view's own padding: each edge gets the larger of its own padding and the overlap plus `gap` |
| `underlying` | `boolean` | `false` | Also avoid app UI drawn beneath the view |
| `onInsetsChange` | `(insets: EdgeInsets) => void` | | Called with the view's insets, once measured and whenever they change |
| `ref` | `Ref<HostInstance>` | | The underlying host view |

| `mode` | What happens | Applied by |
| --- | --- | --- |
| `padding` | The children move in; the view's box and background stay | React Native layout |
| `margin` | The view's box moves in, and so does what's laid out next to it | React Native layout |
| `offset` | The whole view moves, with a transform on top of its own | Natively, in the same frame (iOS, Android) |
| `none` | Nothing; read the insets with `onInsetsChange` or `useSafeAreaViewInsets` | |

### `SafeAreaAccessory`

Your own UI floating over the content, which other views avoid where it's drawn on top of them. Takes the props of
`SafeAreaView`, plus:

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `edge` | `Edge` | the nearest screen edge | The edge it belongs to: content beneath it moves away from that edge |

### `useSafeAreaStyle(options?): SafeAreaStyle`

`SafeAreaView` for a component whose root you don't control, such as a `Pressable`. Render `probe` inside the root and
put `style` after the root's own style.

- `options: UseSafeAreaStyleOptions`: `edges`, `mode`, `granular`, `dynamic`, `avoid`, `spacing`, `gap`, `underlying`,
  `onInsetsChange`, and `style`, the root's own style, which `additive` and `maximum` edges build on.
- Returns `{ style: ViewStyle | null; insets: EdgeInsets; probe: ReactElement }`. `probe` is an invisible view,
  absolutely positioned to fill the root, that measures it natively.

### `SafeAreaDefaults`

Default props for every `SafeAreaView`, `SafeAreaAccessory`, `AnimatedSafeAreaView` and `useSafeAreaStyle` inside it:
`edges`, `mode`, `granular`, `avoid`, `spacing`, `gap`, `underlying`. A view's own props win, and nested defaults add
to the ones around them. It measures nothing.

### `useSafeAreaViewInsets(): EdgeInsets`

The insets of the nearest `SafeAreaView` around the component, for content that applies them itself. Zero outside a
`SafeAreaView`, and inside one in `offset` mode.

### `useSafeAreaInsetsFor(placement?, options?): EdgeInsets`

The insets an element needs at a position you describe. Nothing is measured; the component re-renders only when these
insets change.

- `placement: GranularPlacement`: any of `top`, `right`, `bottom`, `left`, `width`, `height`, in the screen (or the
  provider). Missing values stretch to the edges; `{}` (the default) is the whole screen.
- `options: SafeAreaInsetsForOptions`: `edges`, `granular`, `avoid`, `spacing`, and `scrollable` (`'vertical'` or
  `'horizontal'`, when the element is in a scroll view).

### `useSafeAreaRegions(): readonly SafeAreaRegion[]`

What the OS and the app draw over, on the screen (or the provider).

```ts
type SafeAreaRegion = {
  kind: SafeAreaRegionKind; // 'status' | 'cutout' | 'controls' | 'accessory' | 'fold' | 'inset'
  edge: Edge | null; // the edge it hugs; null for a floating one (a fold)
  side?: Edge; // for a corner region (iPad window controls), the other edge it hugs
  frame: Rect;
  owner?: number; // the view drawing app UI; absent for system UI, which covers everything
};
```

A region with a `side` sits in a corner. An element moves away from its `edge` unless that takes more than half of
its size along that axis, or `edge` isn't in its `edges`; then it moves away from `side`. A header level with an iPad
window's controls moves past them; a whole screen starts below them.

### `useSystemControls(): SystemControls | null`

The strip along one edge where the system puts its controls and yours may join, such as the iPhone Duo's vertical
bar, or `null`.

```ts
type SystemControls = {
  edge: Edge; // the edge the strip runs along
  strip: Rect; // the whole strip: the inset band on that edge
  occupied: Rect[]; // the status cluster, the system's controls, the system back button, the end beyond where controls go
  free: Rect[]; // the stretches nothing occupies, from start to end
  itemSize: number; // the size of the system's own controls in the strip
  center: number; // the line the system centers its controls on: an x for a vertical strip, a y for a horizontal one
};
```

### `useTabBarEdge(): Edge`

Where the system puts a tab bar here, whether or not the app has one: the vertical bar's edge on the iPhone Duo
(closed, or open in landscape), `'top'` in an iPad window of regular width, `'bottom'` everywhere else.

### `SystemBackButton`, `useSystemBackButton(options)`

A system back button where the platform has a place for one in its own controls (the iPhone Duo's vertical bar), in
place of your own.

| Option | Type | Default | |
| --- | --- | --- | --- |
| `onPress` | `() => unknown` | | Called when the system's button is pressed |
| `enabled` | `boolean` | `true` | Turn the system's button off |
| `icon` | `'back' \| 'close'` | `'back'` | A chevron, or a cross for modals |
| `accessibilityLabel` | `string` | `'Back'` / `'Close'` | |

`SystemBackButton` takes the options plus `children`, your own back button, shown where the system's isn't, and
`keepSpace` (`false`): keep your button laid out but invisible while the system shows its own, instead of unmounting it.

The most recent screen that is showing gets the button: in the window, and not hidden or fully transparent through an
ancestor (`opacity: 0`, `display: 'none'`), checked after every React Native update.
`useSystemBackButton` returns `{ shown: boolean; button: ReactElement }`: render `button` anywhere in the screen, and
hide your own while `shown`.

### `GranularSafeAreaProvider`

Optional. Takes `ViewProps`, plus:

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `mock` | `GranularSafeAreaMetrics \| null` | | Recorded metrics to use instead of the platform's, such as one of `fixtures` |
| `granular` | `boolean` | `true` | `false` makes every region a whole band, for comparing |
| `debug` | `boolean` | `false` | Draw the regions over the app, labelled with their kinds |

Views and hooks inside measure relative to the provider.

### `GranularSafeAreaDebugOverlay`

Draws the regions, labelled with their kinds, and a caption with how many there are. `<GranularSafeAreaProvider debug>`
renders one; without a provider, render it last in the app's root view. Takes an optional `store`.

### Functions and values

| Export | |
| --- | --- |
| `refreshSafeAreas(): void` | Re-read the OS UI right away, e.g. after your own navigation |
| `getDiagnostics(): Promise<Record<string, unknown> \| null>` | Everything the native side can see, for bug reports. `null` where there's no native side |
| `fixtures` | Recorded metrics: `iPhoneDuoOuterPortrait`, `iPhoneDuoOuterPortraitWithTabBar`, `iPhoneDuoOuterPortraitWithNativeHeader`, `iPhoneDuoOuterLandscape`, `iPhoneDuoInnerLandscape`, `iPhoneDuoInnerBookFold`, `iPhoneDuoInnerPortrait`, `iPhone18ProPortrait`, `iPadProFullScreen`, `iPadProWindow`, `pixel10Portrait`, `pixel10Landscape` |

### Types

`SafeAreaViewProps`, `SafeAreaAccessoryProps`, `SafeAreaDefaultsOptions`, `UseSafeAreaStyleOptions`, `SafeAreaStyle`,
`GranularSafeAreaDebugOverlayProps`, `SafeAreaInsetsForOptions`, `GranularInsetsOptions`,
`GranularSafeAreaMode`, `GranularPlacement`, `SafeAreaRegion`, `SafeAreaRegionKind`, `SystemControls`,
`SystemBackButtonProps`, `SystemBackButtonIcon`, `UseSystemBackButtonOptions`, `UseSystemBackButtonResult`,
`GranularSafeAreaProviderProps`, `GranularSafeAreaMetrics`, `FixtureName`, `ScrollAxes`, and safe-area-context's
`Edge`, `Edges`, `EdgeMode`, `EdgeRecord`, `EdgeInsets`, `Rect`.

## `/reanimated`

### `AnimatedSafeAreaView`

Takes the props of `SafeAreaView`, with Reanimated's animated styles, plus:

| Prop | Type | |
| --- | --- | --- |
| `transition` | `(toValue: number) => number` | A worklet returning the animation to each new inset: `(to) => { 'worklet'; return withSpring(to); }`. For `offset` and `padding`; `margin` changes without animating |
| `insets` | `SharedValue<EdgeInsets>` | A shared value the view writes its insets to on the UI thread. Use with `mode="none"` |

## `/jest`

The main entry's exports for Jest. `SafeAreaView` and `SafeAreaAccessory` render a `View`, `useSafeAreaViewInsets` and
`useSafeAreaStyle` give zero insets. By default there's nothing to avoid; with `<GranularSafeAreaProvider mock={...}>`
or `mockSafeAreaMetrics(metrics | null)`, the hooks compute what they would on that device (`useSafeAreaRegions`,
`useSystemControls`, `useSafeAreaInsetsFor`, `useTabBarEdge`), and `SystemBackButton` shows a pressable stand-in with
the test ID `SystemBackButton` where the system would show its button. react-native-safe-area-context comes through as
is, so mock it too:

```ts
jest.mock('react-native-granular-safe-areas', () => require('react-native-granular-safe-areas/jest'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
```

## `/testing`

| Export | |
| --- | --- |
| `parseMetrics(json)` | Metrics from the native side's JSON |
| `buildRegions(metrics, options?)` | Regions from metrics |
| `computeElementInsets(element, regions, options?)` | The insets an element needs to clear the regions |
| `safeAreaViewInsets(element, options)` | What a `SafeAreaView` computes: bands or regions, scroll views, what covers it, where it's seen |
| `getSystemControls(metrics, extra?)` | The system controls strip |
| `getTabBarEdge(metrics)` | Where the system puts a tab bar |
| `placementToRect(placement, { width, height })` | A `GranularPlacement` as a rect |
| `metricsFromInsets(width, height, insets, platform?)` | Metrics for a plain safe area |
| `metricsForSubrect(metrics, rect)` | Metrics relative to a part of the screen |
| `fixtures` | Recorded metrics |
| `useGranularSafeAreaMetrics()`, `useGranularSafeAreaStore()` | The metrics and the store the hooks read |

Types: `GranularSafeAreaMetrics`, `ReservedRegionFrame`, `SystemBarFrame`, `SafeAreaRegion`, `BuildRegionsOptions`,
`ElementInsetsOptions`, `SafeAreaViewInsetsOptions`, `GranularPlacement`, `SystemControls`, `GranularSafeAreaSnapshot`,
`GranularSafeAreaStore`.
