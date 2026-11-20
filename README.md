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

Render a `GranularSafeAreaProvider` inside `SafeAreaProvider`, near the root. One is enough: sheets and modals don't
need their own. (Both go away soon: see [docs/api.md](docs/api.md) for where the API is heading.)

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

`SafeAreaView` from this package is a drop-in for react-native-safe-area-context's, with the same props. Switching
over means changing the import: by default a view keeps clear of the whole inset band on each edge it overlaps, like
the regular one. Then you opt the views that benefit into granular avoidance, one by one.

```tsx
import { SafeAreaView } from 'react-native-granular-safe-areas';

// A list row: kept clear of the whole side column, so it never goes under the OS UI however far it scrolls.
<SafeAreaView edges={['left', 'right']} style={styles.row}>…</SafeAreaView>

// A header: the background runs under the status cluster, the content moves in next to it.
<SafeAreaView granular edges={['top', 'left', 'right']} style={styles.header}>…</SafeAreaView>

// A floating button: moved as a whole, and only if something is actually beside it.
<SafeAreaView granular mode="offset" spacing={8} style={styles.fab}>…</SafeAreaView>

// A badge on a scrolling card: moves in only while it passes the status cluster or a bar.
<SafeAreaView dynamic mode="offset" edges={['left', 'right']} style={styles.badge}>…</SafeAreaView>
```

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
as you scroll or animate. A screen sliding in or out with navigation counts as moving: the view is measured where the
screen comes to rest, and before the first frame from React Native's layout, so nothing jumps as it arrives.

A band runs the full length of its edge, so a default view stays clear of the OS UI wherever it moves along that edge:
a row in a list keeps clear of the side column however far it scrolls, and nothing reflows while you scroll. This
follows Apple's guidance for scrolling content.

Scroll views are detected (any React Native `ScrollView`, so `FlatList`, `SectionList`, FlashList and the rest too):

- The bands on the edges the content scrolls towards are left to the scroll view's content inset. Otherwise a row
  measured at the bottom would keep the home indicator's inset as it scrolls up.
- A view that is out of sight when it's measured, further down the list, gets the inset it will need on screen.
- `granular` acts like the default there, because the view's position along the scroll axis isn't fixed. Use
  `dynamic` for granular content in a scroll view.
- A pager (`pagingEnabled`) is measured where its pages come to rest.

On a device the library doesn't fully understand, there's nothing finer than the bands, so all three behave like a
regular safe area.

### Applying the insets

| `mode` | What happens | Use it for |
| --- | --- | --- |
| `padding` (default) | The children move in; the view's box and background stay | Containers sized by their parent: headers, bottom bars, rows |
| `margin` | The view's box moves in, and so does what's laid out next to it | Like safe-area-context's `margin` mode |
| `offset` | The whole view moves, with a transform on top of its own | Floating buttons, badges, anything sized by its content |
| `none` | Nothing; read the insets with `onInsetsChange` | Layouts of your own |

`edges` works as in react-native-safe-area-context: a list of edges, or an object with `'additive'` (add the inset to
the view's own padding or margin), `'maximum'` (use whichever is larger) or `'off'` per edge.

On iOS every `SafeAreaView` is a native view that measures itself, and applies `offset` itself, in the same frame.
Padding and margin change layout, which only React Native can do, so when they change, JS applies them a frame or two
later. A view is measured as laid out, without its own `transform`, so animating it never feeds back into its insets.

### Moving content

`dynamic` makes a view follow its position as it moves, whatever moves it: scrolling, layout changes, gestures, screen
transitions, and animations from Reanimated or Animated's native driver. On iOS it observes the geometry of every view
between itself and the provider, and measures itself again in the same frame as one of them moves. Nothing polls, and
nothing runs in JavaScript while it moves. In a scroll view it ignores the regions on the scrolling edges, so it
doesn't stick under the home indicator as it scrolls past.

Use `offset` for moving content: it's applied natively, in the same frame. `padding` and `margin` change layout a frame
or two after the view moves, and the layout change ripples to everything around it.

What it costs: one coordinate conversion, about a microsecond, whenever the view or one of its ancestors moves, and
after each React Native mounting transaction (for every `SafeAreaView`). A list with 300 granular views, half of them
dynamic, scrolled as fast as it goes, spends 1 to 4% of the main thread on them on the iPhone Duo simulator.

On the web, a dynamic view measures again on every frame something scrolls. On Android, where the regions are still
plain bands, it behaves like a granular one.

### Insets for a layout of your own

`useSafeAreaInsetsFor` gives the insets for a position you describe, for you to apply yourself, like
`useSafeAreaInsets()`. Nothing is measured, and the component re-renders only when those insets change.

```tsx
import { useSafeAreaInsets, useSafeAreaInsetsFor } from 'react-native-granular-safe-areas';

function Header() {
  const { top } = useSafeAreaInsets();
  // A full-width strip at the top. On the Duo, `right` is 84 only because the status cluster is beside it.
  const insets = useSafeAreaInsetsFor({ top: 0, height: top + 56 }, { granular: true });
  return (
    <View style={{ height: top + 56, paddingTop: insets.top, paddingRight: 16 + insets.right }}>
      ...
    </View>
  );
}

// A floating button 16 pt from the right edge and 120 pt from the bottom.
const fab = useSafeAreaInsetsFor({ right: 16, bottom: 120, width: 56, height: 56 }, { granular: true });
<FAB style={{ position: 'absolute', right: 16 + fab.right, bottom: 120 + fab.bottom }} />
```

Describe the position the way you would absolutely position the element in the provider (usually the screen). Missing
sides stretch to the provider's edges, so `{ top: 0, height: 56 }` is a full-width strip, and with no placement at all
you get the same insets as `useSafeAreaInsets()`. Nothing tells it the element is in a scroll view, so say so with
`scrollable: 'vertical'` or `'horizontal'`.

`useSafeAreaRegions()` returns the regions themselves, in the provider's coordinates, for layouts of your own:

```tsx
const regions = useSafeAreaRegions();
// [{ kind: 'status', edge: 'right', frame: { x: 382, y: 0, width: 84, height: 174 } }, ...]
```

### Options

| Option | Default | |
| --- | --- | --- |
| `edges` | all four | Edges the element may be pushed in from |
| `granular` | `false` | Avoid only the regions it overlaps, not whole bands |
| `dynamic` | `false` | `SafeAreaView` only. Follow the view as it moves; implies `granular` |
| `mode` | `'padding'` | `SafeAreaView` only. `padding`, `margin`, `offset` or `none` |
| `spacing` | `0` | Extra clearance around each region, in points |
| `avoid` | everything except `'fold'` | Region kinds to avoid: `inset`, `status`, `camera`, `systemBar`, `accessory`, `fold`. `[]` avoids nothing |
| `underlying` | `false` | `SafeAreaView` only. Also avoid app UI drawn beneath the view; see [Sheets, modals and overlays](#sheets-modals-and-overlays-what-covers-a-view) |
| `onInsetsChange` | | `SafeAreaView` only. Called with the view's insets, once measured and whenever they change |
| `scrollable` | | `useSafeAreaInsetsFor` only. `'vertical'` or `'horizontal'` |

Folds aren't avoided by default: a full-width header that spans a book fold shouldn't be squeezed onto one half. Add
`'fold'` to `avoid` for small controls you want off the hinge.

### Staying in sync

The regions follow the system UI as it changes, and every automatic and manual consumer updates with them:

| Change | How it's noticed |
| --- | --- |
| Rotation, folding and unfolding, Split View, window resizing | Layout, safe-area and trait callbacks |
| The camera area growing or shrinking (Dynamic Island with a Live Activity), the fold becoming active, the inner camera turning on | UIKit's reserved-region change tracking |
| A UIKit bar growing, shrinking, moving, hiding or fading: vertical bar items added or removed, a large title collapsing, a tab bar hidden | Key-value observation of the bar, as soon as the change starts |
| Bars appearing or disappearing with navigation or a tab switch | Re-scan when safe-area views mount, and a re-scan once a second while UIKit bars or a side column are present |
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

### Sheets, modals and overlays: what covers a view

A view only keeps clear of what can actually cover it:

- **System UI** is drawn on top of everything: the status bar and the iPhone Duo's status cluster, cameras and the
  Dynamic Island, the home indicator. Every view avoids it.
- **App UI** (navigation and tab bars, the Duo's vertical bar items, the vertical bar back button, and your own
  accessories) only covers what's drawn beneath it.

A sheet or modal is drawn on top of the screen it came from, and so is a bottom sheet or overlay drawn in JavaScript at
the root of the app. So content in a sheet ignores the tab bar and the accessories of the screen underneath, and still
keeps clear of the home indicator:

```
Regular iPhone, a tab screen with a boarding pass button        The same with a sheet over it
┌─────────────────────────┐                                     ┌─────────────────────────┐
│ list ...                │                                     │ list ...                │
│ last card               │ ← the list ends above all three     ├─────────────────────────┤
│ [ boarding pass ]       │   (accessory)                       │ sheet                   │
│ [ Trips  Probe  Me ]    │   (tab bar)                         │ [ Done ]                │ ← 34 pt: the home
│          ───            │   (home indicator)                  │          ───            │   indicator only
└─────────────────────────┘                                     └─────────────────────────┘
```

On the iPhone Duo, a sheet covers the vertical tab bar in the column, so content in it uses the full width. A
full-screen modal reaches up to the status cluster, which is drawn on top of it, so it keeps clear of that.

A view is also only seen inside its clipping ancestors (a sheet, a scroll view, `overflow: hidden`), and what can't reach
that area can't cover it. A sheet that starts below the Duo's status cluster has nothing to avoid in the column, even
avoiding whole bands, and a list only keeps clear of what's beside its own scroll view.

None of this needs setting up: a sheet or modal needs no provider of its own. Native sheets and modals are measured
where they come to rest while they're still sliding in, so their content is right before they're on screen.

For a transparent overlay that should keep clear of the UI underneath anyway, such as a toast that sits above the tab
bar rather than over it, set `underlying`.

### Accessories

`SafeAreaAccessory` marks your own UI floating over the content (a boarding pass button, a mini player, a tab bar you
draw yourself) as something other views avoid. It's a `SafeAreaView`, so it keeps clear of the OS UI itself:

```tsx
import { SafeAreaAccessory } from 'react-native-granular-safe-areas';

<SafeAreaAccessory granular edges={['left', 'right', 'bottom']} style={styles.boardingPass}>
  <BoardingPassButton />
</SafeAreaAccessory>
```

Content in the same screen moves clear of it; sheets and modals on top of it ignore it. It belongs to the screen edge
it's closest to, so content beneath it moves away from that edge; set `edge` to choose another.

### Insets for the content of a view

`useSafeAreaViewInsets()` returns the insets of the nearest `SafeAreaView` around a component. Use it for content that
applies insets itself, such as a list's content padding. With `mode="none"`, the view applies nothing and only measures:

```tsx
function Screen() {
  return (
    <SafeAreaView mode="none" edges={['bottom']} style={{ flex: 1 }}>
      <List />
    </SafeAreaView>
  );
}

function List() {
  const { bottom } = useSafeAreaViewInsets();
  return <FlatList contentContainerStyle={{ paddingBottom: bottom }} … />;
}
```

The view measures its own box, so the list ends above the tab bar and your accessories in a tab screen, and above the
home indicator only in a sheet. It's zero outside a `SafeAreaView`, and inside one in `offset` mode, which moves as a
whole.

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

The regions live in a small store outside React state, in two versions: broken down as far as the platform allows, and
with every band whole. App UI regions name the view that draws them: UIKit bars get an id from the native side (which
scans every presentation in the window), accessories and the vertical bar back button bring their own.

A `SafeAreaView` gets the regions as props. Natively it finds the provider (the nearest one above it, or else the one
covering its window, so sheets and modals need none), and when it's laid out it works out which app UI is drawn on top
of it: where their branches of the view hierarchy meet, which comes later, or has the higher `zIndex`. It finds where
it can be seen (its clipping ancestors), its position as laid out (React Native's views without the transforms React
Native gives them, UIKit's containers where UIKit has them), and the scroll views around it, and works out how far each
edge must move in to clear what covers it. It applies `offset` itself and reports the insets to JS for padding, margin
and `none`. Before the first frame, JS measures it once with `getBoundingClientRect()`, from React Native's layout,
telling accessories underneath from the order of the tree, and the native view starts from that.

`useSafeAreaInsetsFor` computes the same thing from the placement you gave it, and re-renders only if its insets
changed. On the web and on Android, `SafeAreaView` measures itself from JS the same way, when it mounts, when its layout
changes and when the store changes.

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
- a trip screen modelled on a real app that broke on the Duo: default rows, granular floating controls, dynamic badges,
  a manual header and the vertical bar back button
- a trip details screen with a floating back button over a hero picture, which becomes the Duo's back button
- the same trip screen inside native tabs
- edge markers, a marker every 40 pt down the right edge that shows which ones move as the system UI changes
- moving elements: a default, a granular and a dynamic pill moved up and down the edge by a native-driver animation
- native header items you can add and remove, to watch the vertical bar grow and shrink
- a JS bottom sheet, a native form sheet and a full-screen modal, opened from the trip screen: the next flight bar is an
  accessory, so the list ends above it, while each overlay's footer only keeps clear of the home indicator
- the probe

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
