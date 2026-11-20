# Target API (draft for approval)

This is the API the library is moving to. Once it's implemented, it becomes the README. Nothing has been published, so
nothing here keeps old names around.

Goals: nothing to set up, one component for most needs, safe by default with granular avoidance where you ask for it,
nothing moving unless you ask for it, and no device-specific concepts in the API. The iPhone Duo is the first device
the model fully understands, not the shape of the API.

## Setup

None. Install the package (and run `pod install`). It works with or without react-native-safe-area-context's
`SafeAreaProvider`; React Navigation and Expo Router mount one anyway.

```sh
pnpm add react-native-granular-safe-areas react-native-safe-area-context
```

`GranularSafeAreaProvider` still exists, but it's optional; see [Previews, tests and debugging](#previews-tests-and-debugging).

## `SafeAreaView`

A drop-in for react-native-safe-area-context's `SafeAreaView`, with the same props. Switching an app over means
changing the import: by default a view keeps clear of the whole inset band on each edge it overlaps, like the regular
one. Then the views that benefit opt into granular avoidance, one by one.

Everything else from react-native-safe-area-context is re-exported unchanged (`useSafeAreaInsets`, `SafeAreaProvider`,
`initialWindowMetrics`, ...), so one import covers every safe-area need.

```tsx
import { SafeAreaView } from 'react-native-granular-safe-areas';

// A list row: kept clear of the whole side column, so it never goes under the OS UI however far it scrolls.
<SafeAreaView edges={['left', 'right']} style={styles.row}>…</SafeAreaView>

// A floating button: moved as a whole, and only if something is actually beside it.
<SafeAreaView granular mode="offset" spacing={8} style={styles.fab}>…</SafeAreaView>

// A badge on a scrolling card: moves in only while it passes the status cluster or a bar.
<SafeAreaView dynamic mode="offset" edges={['left', 'right']} style={styles.badge}>…</SafeAreaView>
```

| Prop | Default | |
| --- | --- | --- |
| `edges` | all four | Edges the view may be pushed in from. An array, or an object like safe-area-context's: `{ top: 'additive' \| 'maximum' \| 'off', ... }` |
| `mode` | `'padding'` | How the insets are applied; see below |
| `avoid` | all but `'fold'` | Region kinds to avoid: `status`, `cutout`, `controls`, `fold`, `inset` |
| `spacing` | `0` | Extra clearance around each region, in points |
| `granular` | `false` | Avoid only the regions the view overlaps, not whole bands; see [Bands, granular and dynamic](#bands-granular-and-dynamic) |
| `dynamic` | `false` | Follow the view as it moves, avoiding only what it overlaps right now. Implies `granular`; see [Moving content](#moving-content) |
| `onInsetsChange` | | Called on the JS thread with the view's insets when they change |
| `underlying` | `false` | Also avoid app UI drawn beneath the view (bars and accessories under a sheet) |

| `mode` | What happens | Applied by |
| --- | --- | --- |
| `padding` | The children move in; the view's box and background stay | React Native layout |
| `margin` | The view's box moves in, and so does what's laid out next to it | React Native layout |
| `offset` | The whole view moves, with a transform on top of its own | Natively, in the same frame |
| `none` | Nothing; read the insets with `onInsetsChange` or Reanimated | – |

### Where a view is measured

A view is measured as laid out: through its ancestors' transforms and the scroll positions around it, in whatever it's
presented in (the screen, a sheet, a modal), but without its own `transform`. Animating the view itself never feeds back
into its insets.

### Bands, granular and dynamic

Every view measures where it is and works out the inset it needs there. What it avoids, and when it measures, is up to
you:

| | Avoids | Measured | Use it for |
| --- | --- | --- | --- |
| Default | The whole inset band on each edge it overlaps (on the iPhone Duo, the full side column), and anything outside the bands, such as a transparent navigation bar | When laid out | Most things, and anything in a scroll view that shouldn't move around |
| `granular` | Only the regions it overlaps where it's laid out: the status cluster, a camera, a bar | When laid out | Fixed UI: headers, floating buttons, bottom bars, overlays, maps |
| `dynamic` | Only the regions it overlaps right now | As it moves | Content that moves past the OS UI and should dodge it, such as a badge on a scrolling card |

"When laid out" means when the view mounts, when its layout changes, and when the OS UI changes (rotation, folding, a
bar appearing, the Dynamic Island growing). Movement is a design decision, so a view that isn't `dynamic` never moves
as you scroll or animate.

A band runs the full length of its edge, so a default view stays clear of the OS UI wherever it moves along that edge:
a row in a vertical list keeps clear of the side column however far it scrolls, and nothing reflows while you scroll.
This follows Apple's guidance for scrolling content.

In a scroll view (detected automatically):

- The bands on the edges the content scrolls towards (the top and bottom of a vertical list) are left to the scroll
  view's content inset. Otherwise a row measured at the bottom would keep the home indicator's inset as it scrolls up.
- A view that is out of sight when it's measured, further down the list, gets the inset it will need when it scrolls
  into view.
- `granular` behaves like the default, because the view's position along the scroll axis isn't fixed. Use `dynamic`
  for granular content in a scroll view.
- A pager (`pagingEnabled`) is measured where its pages come to rest.

A screen sliding in or out with navigation counts as moving too: a view that isn't `dynamic` is measured where the
screen comes to rest, and before the first frame from React Native's layout, so nothing jumps as it arrives.

On a device the library doesn't fully understand, there's nothing finer than the bands, so all three behave like a
regular safe area.

### What covers a view

A view only keeps clear of what can actually cover it. System UI (the status bar and status cluster, cameras, the home
indicator) is drawn on top of everything. App UI (navigation and tab bars, the vertical bar items, accessories) only
covers what's drawn beneath it, so a sheet or modal, native or drawn in JS, ignores the tab bar and the accessories of
the screen underneath. And only where the view can be seen counts: a sheet that starts below the iPhone Duo's status
cluster has nothing to avoid in the column. `underlying` makes a view avoid app UI beneath it too, for transparent
overlays.

`SafeAreaAccessory` marks your own floating UI (a boarding pass button, a mini player, a tab bar drawn in JS) as app UI
other views avoid. It takes the props of `SafeAreaView`, plus `edge`, the edge it belongs to (the nearest by default).
`useSafeAreaViewInsets()` reads the insets of the nearest `SafeAreaView`, for content that applies them itself, such as
a list's content padding inside `<SafeAreaView mode="none">`.

## Moving content

`dynamic` opts a view into following its position as it moves, avoiding only the regions it overlaps right now: a
badge on a card sits at the card's edge in the free stretch of the iPhone Duo column, and moves in while it passes the
status cluster or a bar.

```tsx
<ScrollView>
  {trips.map((trip) => (
    <Card key={trip.id}>
      <SafeAreaView dynamic mode="offset" edges={['left', 'right']} style={styles.badge}>
        <Text>Check-in open</Text>
      </SafeAreaView>
    </Card>
  ))}
</ScrollView>
```

It follows any movement, whatever causes it: scrolling, layout changes, gestures, screen transitions, and animations
from Reanimated or Animated's native driver. On iOS and Android this all happens natively, on the UI thread, driven by
the changes themselves: nothing polls, and nothing runs in JavaScript while the view moves. In a scroll view it ignores
the regions on the scrolling edges, so it doesn't stick under the home indicator as it scrolls past.

- `offset` is the mode for moving content: the native side moves the view in the same frame.
- `padding` and `margin` change layout, which only React Native can do. They are applied a frame or two after the view
  moves, and the layout change ripples to everything around it.
- Without Reanimated, the change is instant. To animate it, see [Animating with Reanimated](#animating-with-reanimated).

## Animating with Reanimated

`react-native-granular-safe-areas/reanimated` is an optional entry point. It needs `react-native-reanimated` (4 or
newer) and `react-native-worklets`, as optional peer dependencies; the main entry never imports them.

`AnimatedSafeAreaView` takes everything `SafeAreaView` and `Animated.View` take, plus two props.

`transition` animates every change of the insets with any Reanimated animation:

```tsx
import { AnimatedSafeAreaView } from 'react-native-granular-safe-areas/reanimated';
import { withSpring } from 'react-native-reanimated';

<AnimatedSafeAreaView
  dynamic
  mode="offset"
  edges={['left', 'right']}
  transition={(to) => {
    'worklet';
    return withSpring(to);
  }}
  style={styles.badge}
>
  <Text>Check-in open</Text>
</AnimatedSafeAreaView>
```

`insets` hands you the insets as a shared value, for animations of your own. Use it with `mode="none"`:

```tsx
const insets = useSharedValue({ top: 0, right: 0, bottom: 0, left: 0 });
const style = useAnimatedStyle(() => ({
  transform: [{ translateX: withSpring(-insets.value.right) }],
  opacity: withTiming(insets.value.right > 0 ? 0.9 : 1),
}));

<AnimatedSafeAreaView dynamic mode="none" insets={insets} style={[styles.badge, style]}>
  <Text>Check-in open</Text>
</AnimatedSafeAreaView>
```

The native view reports new insets as an event. Reanimated handles it on the UI thread as it's dispatched, the same way
`useAnimatedScrollHandler` handles scrolling, so the animation starts on the next frame without a trip through
JavaScript. Both props work with or without `dynamic`, so changes of the OS UI can be animated too.

## Insets for a layout of your own

`useSafeAreaInsetsFor` gives the insets for a position you describe, for you to apply, like `useSafeAreaInsets()`. Use
it for layouts the component can't express, such as a header whose height depends on the insets.

```tsx
const { top } = useSafeAreaInsets();
const header = useSafeAreaInsetsFor({ top: 0, height: top + 56 });
<View style={{ height: top + 56, paddingTop: header.top, paddingRight: 16 + header.right }} />
```

Describe the position the way you'd absolutely position the element on the screen; missing sides stretch to the edges.
Options: `edges`, `avoid`, `spacing`, `granular`, and `scrollable` (`'vertical'` or `'horizontal'`), since nothing is
measured that could tell it's in a scroll view. It re-renders only when the insets change.

## Regions

`useSafeAreaRegions()` returns what the OS draws over, on the screen:

```ts
type SafeAreaRegion = {
  kind: 'status' | 'cutout' | 'controls' | 'accessory' | 'fold' | 'inset';
  owner?: number; // the view drawing app UI; absent for system UI, which covers everything
  edge: 'top' | 'right' | 'bottom' | 'left' | null; // the edge it hugs; null for a floating one (a fold)
  frame: { x: number; y: number; width: number; height: number };
};
```

| Kind | What it is |
| --- | --- |
| `status` | The status bar and what's in it: time, signal, battery |
| `cutout` | A camera or sensor housing: the Dynamic Island, a punch-hole, the iPhone Duo's outer camera |
| `controls` | System controls drawn over the app: the iPhone Duo's vertical bar items, UIKit bars, iPad window controls, the window buttons in an Android caption bar |
| `accessory` | Your own UI floating over the content, marked with `SafeAreaAccessory` |
| `fold` | A fold or hinge |
| `inset` | A safe-area inset band the platform didn't break down further, avoided as a whole |

`useSystemControls()` describes the strip along one edge where the system puts its controls and yours may join: the
iPhone Duo column, an Android caption bar, an iPad title bar. It returns the `edge`, the `strip`, the `occupied`
stretches, the `free` ones, the system's item size and the line its items are centered on, or `null`. Most apps never
need it. (Refined in the phase that adds Android caption bars and iPad window controls.)

## System back button

```tsx
<SystemBackButton onPress={() => navigation.goBack()}>
  <MyBackButton onPress={() => navigation.goBack()} />
</SystemBackButton>
```

Where the platform has a place for a back button in its own controls (the iPhone Duo's vertical bar), it shows a system
back button there and hides yours. Everywhere else, yours stays. The button is part of the screen, so it moves with
screen transitions and leaves with the screen. It gives way to a native header that already shows one. Other screen
elements avoid it as a `controls` region.

Props: `onPress`, `enabled`, `icon` (`'back'` or `'close'`), `accessibilityLabel`, and `children` (your button).
`useSystemBackButton(options)` returns `{ shown, button }`: render `button` anywhere in the screen, and use `shown` to
lay out the rest, such as moving a title over when your own button is hidden.

## Previews, tests and debugging

`GranularSafeAreaProvider` is optional. Use it to:

- **simulate a device**: `mock={fixtures.iPhoneDuoOuterPortrait}` lays out for the Duo on any device or in a browser. Recorded
  metrics for the Duo in every pose and for a regular iPhone are in `fixtures`.
- **debug**: `debug` draws the regions, and outlines each granular view with the insets it got.
- **compare**: `granular={false}` turns `granular` and `dynamic` off for every view inside, so they all avoid whole
  bands.
- **scope a custom overlay**: views and `useSafeAreaInsetsFor` inside measure relative to it. Native modals and sheets
  don't need this; they're detected.

```tsx
<GranularSafeAreaProvider mock={__DEV__ ? fixtures.iPhoneDuoOuterPortrait : undefined} debug={__DEV__}>
  <App />
</GranularSafeAreaProvider>
```

Tests: `jest.mock('react-native-granular-safe-areas', () => require('react-native-granular-safe-areas/jest'))`
replaces the native parts, like react-native-safe-area-context's mock. The geometry (`buildRegions`,
`computeElementInsets`, ...) is exported from `react-native-granular-safe-areas/testing`.

`getDiagnostics()` returns everything the native side sees, for bug reports and new devices. `refreshSafeAreas()`
re-reads the OS UI right away, e.g. after your own navigation.

## Platforms

| Platform | Regions | Views |
| --- | --- | --- |
| iOS 27.1+ | Status cluster, cameras, the iPhone Duo's vertical bar and its items, UIKit bars, folds. iPad window controls (to be probed) | Native |
| Older iOS | Regular bands | Native |
| Android | Cutout rects, caption-bar window controls (Android 15+ desktop windowing), folds; regular bands otherwise | Native |
| Web | Regular bands from `env(safe-area-inset-*)`; mocks. Possibly the title-bar area of installed desktop PWAs | Measured from JS |

## From the current API

| Now | Becomes |
| --- | --- |
| `SafeAreaProvider` + `GranularSafeAreaProvider`, and one more in every modal | Nothing; the provider is optional |
| `GranularSafeAreaView` | `SafeAreaView granular` (bands without `granular`) |
| `useGranularSafeArea` (props to spread) | Removed: wrap the element in `SafeAreaView` |
| `scrollable` | Detected; kept only on `useSafeAreaInsetsFor` |
| `dynamic` | `dynamic`, opt-in, now following any movement, and implying `granular` |
| `useGranularSafeAreaInsets` | `useSafeAreaInsetsFor` |
| `VerticalBarBackButton`, `useVerticalBarBackButton` | `SystemBackButton`, `useSystemBackButton` |
| `useVerticalBar` | `useSystemControls` |
| `GranularSafeAreaDebugOverlay` | `debug` on the provider |
| `refine` | `granular` on the provider |
| Kinds `camera`, `systemBar` | `cutout`, `controls` |
| `useGranularSafeAreaStore().requestRefresh()` | `refreshSafeAreas()` |
| `useGranularSafeAreaStore`, `useGranularSafeAreaMetrics`, geometry helpers | Internal, or `/testing` |
