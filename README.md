<img src="assets/icon.svg" width="64" height="64" alt="">

# react-native-granular-safe-areas

Safe areas that know where the OS UI actually is.

On the iPhone Duo outer display, the camera, the status bar and the system's vertical tab bar all live in one column on
the right edge. UIKit reports that column as a flat `right: 84` inset. You can pad everything by 84 pt and lose a fifth
of the screen, or ignore it and put buttons under the status bar. This library avoids both: it works out which parts of
the column are occupied and pushes in only the elements that overlap them. Backgrounds still run to the edge.

```
iPhone Duo, closed (466 × 678 pt)
┌──────────────────────────┬────┐
│ header       [Sign in] ←─┼ ●  │  0–174: camera, time and signal: pushed in
│ card ........ [badge] ←──┼ 5G │
│                          │ (‹)│  174–222: back button, as UIKit places it
│ card ────────────────────┼──► │  nothing here: content keeps the full width
│ [next flight ...] [QR] ←─┼ ⌂  │  system tab bar: pushed in
│             [Feedback] ←─┼ ☺  │
└──────────────────────────┴────┘
```

It also gives screens with custom headers the Duo's native back button: wrap your back button in
[`VerticalBarBackButton`](#the-iphone-duo-back-button) and on the Duo it moves into the vertical bar, right below the
status cluster, as a system glass button.

It builds on [react-native-safe-area-context](https://github.com/appandflow/react-native-safe-area-context) and
re-exports all of it, so one import covers every safe-area need.

> **Status: early.** Built and tested on the iPhone Duo simulator (Xcode 27.2, iOS 27.2) in every pose: closed in
> portrait and landscape, open in both orientations, and half open. The recorded Duo metrics come from it. It has not
> run on a physical Duo yet.

## Requirements

- React Native 0.82 or newer, New Architecture (the default since 0.82)
- `react-native-safe-area-context` 5.11 or newer
- iOS: build with Xcode 27.1 (iOS 27.1 SDK) for the iPhone Duo APIs. Older Xcode builds work, but behave like a regular
  safe area.
- Android and web: regular safe-area behavior for now

## Installation

```sh
pnpm add react-native-granular-safe-areas react-native-safe-area-context
cd ios && pod install
```

Expo: use a development build (`npx expo run:ios`); there is no config plugin to add.

## Usage

Render a `GranularSafeAreaProvider` inside `SafeAreaProvider`, near the root:

```tsx
import {
  GranularSafeAreaProvider,
  SafeAreaProvider,
} from 'react-native-granular-safe-areas';

export default function App() {
  return (
    <SafeAreaProvider>
      <GranularSafeAreaProvider>
        <Navigation />
      </GranularSafeAreaProvider>
    </SafeAreaProvider>
  );
}
```

There are two ways to use it.

- **Automatic**: the library measures an element and applies the insets it needs. Use `GranularSafeAreaView`, or
  `useGranularSafeArea` to get props for any element.
- **Manual**: you describe where an element is and get its insets back to apply yourself, like `useSafeAreaInsets()`.
  Use `useGranularSafeAreaInsets`.

Both follow the system UI as it changes; see [Staying in sync](#staying-in-sync).

### Automatic

`GranularSafeAreaView` takes the same `edges` as `SafeAreaView`, but only applies an inset where the view actually
overlaps something:

```tsx
import { GranularSafeAreaView } from 'react-native-granular-safe-areas';

// A header: the background stays full width, the button moves in next to the status cluster.
<GranularSafeAreaView edges={['top', 'left', 'right']} style={styles.header}>
  <Text style={styles.title}>Please sign in again</Text>
  <Button title="Sign in" />
</GranularSafeAreaView>

// A floating button: moved, not padded, and only if a system bar is beside it.
<GranularSafeAreaView mode="offset" spacing={8} style={styles.fab}>
  <ScanButton />
</GranularSafeAreaView>
```

For any other element, `useGranularSafeArea` returns the props to spread onto it: a `ref` to measure it, an
`onLayout`, and the `style` with the insets applied. Pass the element's own style in, so padding is added to its padding.

```tsx
import { useGranularSafeArea } from 'react-native-granular-safe-areas';

function ScanButton() {
  const granular = useGranularSafeArea({ mode: 'offset', spacing: 8, style: styles.fab });
  return (
    <Pressable {...granular.props} onPress={scan}>
      <QrIcon />
    </Pressable>
  );
}
```

The `ref` must reach a host view (`View`, `Pressable`, `Text` and anything else that forwards its ref). If the element
needs your own `onLayout`, pass it in the options rather than overriding the prop. `style` has to be a plain style:
for `Pressable`'s `({ pressed }) => style`, put the pressed styling on an inner view, or use the manual hook. `granular.insets` holds the applied
insets, and `granular.remeasure()` measures again after the element moved without a layout change, e.g. after an
animated transform.

| `mode` | What moves | Use it for |
| --- | --- | --- |
| `padding` (default) | The children. The element's box and background stay put. | Containers sized by their parent: headers, bottom bars, rows |
| `offset` | The whole element, with a transform | Floating buttons, badges, anything sized by its content |

What it costs: one synchronous layout read (`getBoundingClientRect`) when the element mounts, when its layout changes,
and when the system UI changes. Nothing runs per frame, no native view is added per element, and the element
re-renders only when its insets change.

### Manual

`useGranularSafeAreaInsets` gives the insets for a position you describe, the way you would absolutely position the
element in the provider (usually the screen). Nothing is measured, and the component re-renders only when those
insets change.

```tsx
import { useGranularSafeAreaInsets, useSafeAreaInsets } from 'react-native-granular-safe-areas';

function Header() {
  const { top } = useSafeAreaInsets();
  // A full-width strip at the top. On the Duo, `right` is 84 only because the status cluster is beside it.
  const insets = useGranularSafeAreaInsets({ top: 0, height: top + 56 });
  return (
    <View style={{ height: top + 56, paddingTop: insets.top, paddingRight: 16 + insets.right }}>
      ...
    </View>
  );
}

// A floating button 16 pt from the right edge and 120 pt from the bottom.
const fab = useGranularSafeAreaInsets({ right: 16, bottom: 120, width: 56, height: 56 });
<FAB style={{ position: 'absolute', right: 16 + fab.right, bottom: 120 + fab.bottom }} />
```

Missing sides stretch to the provider's edges, so `{ top: 0, height: 56 }` is a full-width strip, and with no
placement at all you get the same insets as `useSafeAreaInsets()`.

`useSafeAreaRegions()` returns the regions themselves, in the provider's coordinates, for layouts of your own:

```tsx
const regions = useSafeAreaRegions();
// [{ kind: 'status', edge: 'right', frame: { x: 382, y: 0, width: 84, height: 208 } }, ...]
```

### Scrolling content

Content in a scroll view passes under every region in the column as it scrolls, so a granular position is only right for
one scroll offset. Mark it `scrollable` and it avoids the whole column, like a regular safe area. Regions on the
scrolling edges are ignored; handle those with the scroll view's content inset, as usual.

```tsx
<ScrollView>
  <GranularSafeAreaView scrollable="vertical" edges={['left', 'right']}>
    {rows}
  </GranularSafeAreaView>
</ScrollView>
```

This follows Apple's guidance: full-width backgrounds and fixed UI, inset scrolling content.

#### Following an element as it scrolls

For a few elements you'll want more: a badge on a card should sit at the card's edge in the free stretch of the
column, and move in only while it passes the status cluster or a bar. Make it `dynamic`:

```tsx
<ScrollView>
  {trips.map((trip) => (
    <Card key={trip.id}>
      <GranularSafeAreaView dynamic scrollable="vertical" mode="offset" edges={['left', 'right']} style={styles.badge}>
        <Text>Check-in open</Text>
      </GranularSafeAreaView>
    </Card>
  ))}
</ScrollView>
```

A dynamic view follows its own position and avoids only what it overlaps right now. With `scrollable` it ignores the
regions on the scrolling edges, so it doesn't stick under the home indicator as it scrolls past.

On iOS it does this natively, on the UI thread, with nothing running in JavaScript while it moves:

- It observes the scroll views between itself and the provider, and applies its new position in the same frame as the
  scroll.
- It measures itself again after every React Native layout change, so it also follows content inserted above it, a
  parent that resizes, and navigation.
- `mode="offset"` is a transform the native view applies to itself, on top of any transform you give it.
  `mode="padding"` changes layout, which only React Native can do, so the native side reports the insets and JS
  applies them a frame or two later. Prefer `offset` for elements that move.

Use it for the elements that need it, not whole lists: each dynamic view does one coordinate conversion per scroll
frame. It doesn't follow native-driven animations of its ancestors (Animated with `useNativeDriver`, Reanimated) other
than scrolling. On the web it measures again on every frame something scrolls. On Android, where the regions are
still plain bands, it behaves like a regular `GranularSafeAreaView`.

`dynamic` is a `GranularSafeAreaView` prop. Set it when the view mounts: changing it remounts the view.

### Options

All of these work on `GranularSafeAreaView`, `useGranularSafeArea` and `useGranularSafeAreaInsets` (`mode` only on the
first two).

| Option | Default | |
| --- | --- | --- |
| `edges` | all four | Edges the element may be pushed in from |
| `mode` | `'padding'` | See [Automatic](#automatic) |
| `spacing` | `0` | Extra clearance around each region, in points |
| `avoid` | everything except `'fold'` | Region kinds to avoid: `inset`, `status`, `camera`, `systemBar`, `fold`. `[]` avoids nothing |
| `scrollable` | – | `'vertical'` or `'horizontal'`; see [Scrolling content](#scrolling-content) |
| `dynamic` | `false` | `GranularSafeAreaView` only. Follow the view as it scrolls or moves; see [Following an element as it scrolls](#following-an-element-as-it-scrolls) |

Folds aren't avoided by default: a full-width header that spans a book fold shouldn't be squeezed onto one half. Add
`'fold'` to `avoid` for small controls you want off the hinge.

### Staying in sync

The regions follow the system UI as it changes, and every automatic and manual consumer updates with them:

| Change | How it's noticed |
| --- | --- |
| Rotation, folding and unfolding, Split View, window resizing | Layout, safe-area and trait callbacks |
| The camera area growing or shrinking (Dynamic Island with a Live Activity), the fold becoming active, the inner camera turning on | UIKit's reserved-region change tracking |
| A UIKit bar growing, shrinking, moving, hiding or fading: vertical bar items added or removed, a large title collapsing, a tab bar hidden | Key-value observation of the bar, as soon as the change starts |
| Bars appearing or disappearing with navigation or a tab switch | Re-scan when granular views mount, and a re-scan once a second while UIKit bars or a side column are present |
| Anything that changed while the app was in the background | Re-scan when the scene becomes active |

The once-a-second re-scan is one walk of the view hierarchy, batched by the system with other wake-ups. It doesn't run
at all in apps without UIKit bars (JavaScript navigation) on devices without a side column. To pick up a change sooner,
for example right after your own navigation, call `useGranularSafeAreaStore().requestRefresh()`.

UIKit bars count as regions wherever they are, not just in the Duo column, so an element under a transparent navigation
bar is pushed below it, and moves as the bar grows or shrinks. Don't wrap components that render *inside* a native header
(custom `headerRight` content): they overlap the bar on purpose.

### The iPhone Duo back button

On the Duo, UIKit puts a navigation controller's back button at the top of the vertical bar, right below the status
cluster. Screens with a custom header (`headerShown: false`, JavaScript navigation, a floating button over a hero image)
don't get it. Wrap your own back button in `VerticalBarBackButton`:

```tsx
import { VerticalBarBackButton } from 'react-native-granular-safe-areas';

<VerticalBarBackButton onPress={() => navigation.goBack()}>
  <MyBackButton onPress={() => navigation.goBack()} />
</VerticalBarBackButton>
```

Wherever the system shows a vertical bar (the Duo closed, or open in landscape), your button is hidden, and the
provider draws a glass back button in the bar, in the place and at the size UIKit uses for its own (`48 × 48`, centered
on the camera). Everywhere else, including a regular iPhone and the Duo open in portrait, your button stays as it is.

- **Follows the status cluster.** The button sits right below it in every pose, and moves when the cluster grows (a
  Live Activity).
- **Other elements avoid it.** It's added as a `systemBar` region, so granular views next to it move in.
- **One button, for the visible screen.** Every screen can offer one; the most recent screen that is showing wins.
  Screens below the top of a stack and unselected tabs drop out on their own, because UIKit takes their views out of
  the window, which the button checks natively. No navigation library is needed.
- **Gives way to UIKit.** If a native header already shows its back button in the bar, the library doesn't draw a
  second one, and your own button stays where it is. It's meant for screens without a native header.

| Prop | Default | |
| --- | --- | --- |
| `onPress` | | Called when the bar's button is pressed |
| `enabled` | `true` | Turn the bar's button off, e.g. while the screen can't go back |
| `icon` | `'back'` | `'back'` (chevron) or `'close'` (cross, for modals) |
| `accessibilityLabel` | `'Back'` / `'Close'` | |
| `children` | | Your own back button, shown where there is no vertical bar |

When hiding the children isn't enough (a header title that should move left, say), use the hook. It returns
`inVerticalBar`, and an `anchor` element to render anywhere in the screen:

```tsx
const back = useVerticalBarBackButton({ onPress: navigation.goBack });
return (
  <Header>
    {back.anchor}
    {back.inVerticalBar ? null : <MyBackButton />}
    <Title style={{ marginLeft: back.inVerticalBar ? 16 : 0 }} />
  </Header>
);
```

`useVerticalBar()` returns the bar itself, for laying out items of your own: its `edge`, the `column`, where items
start (`top`) and end (`bottom`), their horizontal center (`centerX`), and the bar items UIKit shows (`items`).

### Modals and sheets

Each provider measures in its own coordinate space. Put another `GranularSafeAreaProvider` inside every modal or sheet,
as you would a `SafeAreaProvider`.

## How it works

The native side reports raw facts for each provider: the safe-area insets, the `verticalBarEdge` trait, the status bar
frame, UIKit's reserved regions (`UIView.reservedRegions(kind:options:)`), the layout region for a bar on the vertical
bar edge, and the frames of the UIKit bars where the provider is shown. The JavaScript side turns those facts into
regions:

1. Every non-zero inset starts as a full-length band.
2. The band on the vertical bar edge is replaced by a `status` region (from the top down to wherever the status
   cluster ends) and a `systemBar` region for each bar item in it.
3. Active cameras outside the bands become `camera` regions, other UIKit bars become `systemBar` regions, and an
   active fold becomes a `fold` region.

Step 2 happens only when the native side reports where the status cluster ends, and knows every item in the bar.
Otherwise the band stays whole, so a device or configuration the library doesn't understand behaves exactly like a
regular safe area, never worse.

What the Duo simulator showed, and the library relies on:

- **The status cluster** is an occlusion region covering the whole cluster (camera, time and signal: 0–174 pt
  closed in portrait, 0–124 pt open in landscape), and the bar layout region starts right below it. The status bar's
  own frame is a 2 pt placeholder when the bar is vertical, so it's ignored.
- **Bar items** are drawn in a floating bar container (`_UIFloatingBarContainerView`, since iOS 26) that covers the
  whole navigation or tab bar controller. Each item group is a glass capsule inside it: the back button, header items,
  the tab bar platter. The library reports each capsule's frame. When a container is found, an empty bar really is
  empty, so the column is split even on a native stack's root screen.
- **Tab bar controllers** keep an empty, full-height `UITabBar` in the column while the tabs are drawn in the platter;
  the library ignores it.
- **Bar items are centered on the camera** (x 418), not on the column (x 424), which is where the vertical bar back
  button goes too.

The regions live in a small store outside React state. An automatic element measures itself with
`getBoundingClientRect()` in a layout effect and computes how far each edge must move in to clear the regions it
overlaps; a manual one computes the same thing from the placement you gave it. Both recompute when the store changes and
re-render only if their own insets changed. On the New Architecture the first measurement happens before the first
frame is painted, so nothing visibly jumps.

## Debugging and previews

```tsx
import {
  fixtures,
  GranularSafeAreaDebugOverlay,
  GranularSafeAreaProvider,
} from 'react-native-granular-safe-areas';

<GranularSafeAreaProvider mock={__DEV__ ? fixtures.iPhoneDuoOuterPortraitWithTabBar : undefined}>
  <App />
  {__DEV__ && <GranularSafeAreaDebugOverlay />}
</GranularSafeAreaProvider>
```

- `GranularSafeAreaDebugOverlay` draws the regions over the app.
- `mock` replaces the platform's metrics with recorded ones, so you can lay out for the Duo on any device or in a
  browser. `fixtures` has the Duo closed in portrait (plain, with native tabs, with a native header) and landscape, open
  in landscape and portrait, folded like a book, and a regular iPhone. The Duo ones are recorded on the simulator.

### Diagnostics

`getDiagnostics()` returns everything the native side can see for every window: insets, corner-adapted insets, the
status bar, reserved regions (including inactive ones and their margins), `verticalBarEdge`, bar layout regions at
several widths, the view controller tree, and the UIKit views near each side edge. Attach it to bug reports. The
example app's **Probe** screen collects it, logs it to the Metro terminal, and can share it.

## Example app

```sh
pnpm install
pnpm example web     # iPhone Duo simulation in the browser
pnpm example ios     # Xcode 27.1 or newer; pick the iPhone Duo simulator in Device Hub
```

The example has:
- a trip screen modelled on a real app that broke on the Duo, using all three APIs and the vertical bar back button
- a trip details screen with a floating back button over a hero picture, which becomes the Duo's back button
- the same trip screen inside native tabs
- edge markers, a marker every 40 pt down the right edge that shows which ones move as the system UI changes
- native header items you can add and remove, to watch the vertical bar grow and shrink
- a sheet, and the probe

Switch between granular, regular-band and no avoidance to compare. In the browser, **Simulate a Live Activity** grows
the camera area to show everything following it.

## Related

- [react-native-safe-area-context](https://github.com/appandflow/react-native-safe-area-context): regular insets per
  edge, plus corner-adapted insets since 5.11. This library uses it and re-exports it.
- [react-native-reserved-regions](https://github.com/appandflow/react-native-reserved-regions): raw camera and fold
  frames, without the status bar, system bars, or anything that moves views.
- [@garrettmacmac/react-native-duo](https://github.com/garrettmac/react-native-duo): a full iPhone Duo layout toolkit
  with its own bars and panes.

## License

MIT
