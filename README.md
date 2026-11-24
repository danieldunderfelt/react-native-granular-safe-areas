<img src="assets/icon.svg" width="64" height="64" alt="">

# react-native-granular-safe-areas

Safe areas that know where the OS UI actually is, and what's covering what.

On the iPhone Duo outer display, the camera, the status bar and the system's vertical tab bar all live in one column on
the right edge. UIKit reports that column as a flat `right: 84` inset. You can pad everything by 84 pt and lose a fifth
of the screen, or ignore it and put buttons under the status bar. This library avoids both: it works out which parts of
the column are occupied and pushes in only the elements that overlap them. Backgrounds still run to the edge.

```
iPhone Duo, closed (466 × 678 pt)
┌──────────────────────────┬────┐
│ header       [Sign in] ←─┼ ●  │  0–174: camera, time and signal: pushed in
│ card ........ [badge] ←──┼ 5G │
│                          │ (‹)│  174–222: the back button, as UIKit places it
│ card ────────────────────┼──► │  nothing here: content keeps the full width
│ [next flight ...] [QR] ←─┼ ⌂  │  system tab bar: pushed in
│             [Feedback] ←─┼ ☺  │
└──────────────────────────┴────┘
```

It does more than the Duo needs, on every iPhone:

- **Overlays get only what covers them.** A sheet or modal over a tab screen keeps clear of the home indicator, not of
  the tab bar and the floating buttons it covers.
- **Moving content can dodge the OS UI.** A badge on a scrolling card moves in while it passes the status cluster, on
  the UI thread, optionally animated with Reanimated.
- **Your own floating UI counts.** Mark a boarding pass button or a mini player as an accessory, and the content
  beneath it keeps clear of it.
- **Custom headers get the system back button** where the system has a place for one.

It builds on [react-native-safe-area-context](https://github.com/appandflow/react-native-safe-area-context) and
re-exports all of it, so one import covers every safe-area need. Its `SafeAreaView` is a drop-in for that library's.

> **Status: early.** Built and tested on the iPhone Duo simulator (Xcode 27.2, iOS 27.2) in every pose, on the
> iPhone 18 Pro and iPad Pro simulators, and on the Pixel 10 emulator (Android 17). It has not run on a physical Duo
> yet.

## Requirements

- React Native 0.82 or newer, New Architecture (the default since 0.82)
- `react-native-safe-area-context` 5.11 or newer
- iOS: build with Xcode 27.1 (iOS 27.1 SDK) for the iPhone Duo APIs. Older Xcode builds work, but behave like a regular
  safe area.
- Android: `minSdkVersion` 24 or newer
- Optional: `react-native-reanimated` 4 and `react-native-worklets`, for `AnimatedSafeAreaView`

## Installation

```sh
pnpm add react-native-granular-safe-areas react-native-safe-area-context
cd ios && pod install
```

There's nothing to set up: no provider to mount, in the app or in its modals, and nothing to add to Gradle. Expo: use
a development build (`npx expo run:ios`, `npx expo run:android`); there's no config plugin to add.

## Usage

### `SafeAreaView`

`SafeAreaView` takes the same props as react-native-safe-area-context's, so switching over means changing the import.
By default a view keeps clear of the whole inset band on each edge it overlaps, like the regular one. Then you opt the
views that benefit into granular avoidance, one by one.

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
- Clipping inside the scroll view (a row or a rounded card with `overflow: hidden`) scrolls along with the content, so
  it doesn't limit where the view can be seen along the scroll axis: every row in a list lines up, whichever ones
  happen to be next to the status cluster.
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
| `none` | Nothing; read the insets with `onInsetsChange` or `useSafeAreaViewInsets` | Layouts of your own |

`edges` works as in react-native-safe-area-context: a list of edges, or an object with `'additive'` (add the inset to
the view's own padding or margin), `'maximum'` (use whichever is larger) or `'off'` per edge. The view's own padding is
read the way React Native lays it out: `paddingStart`/`paddingEnd`, the `paddingInline`/`paddingBlock` aliases and the
shorthands count, and in a right-to-left app the inset goes on the edge it belongs to.

### Where the padding lives: `gap`

The inset is the overlap: how far the view reaches into what it avoids. What that does to the content depends on who
owns the padding around it:

```
The view owns its padding                    The parent owns it
┌─ view, padding 16 ─────────┬────┐          ┌─ parent, padding 16 ───────┬────┐
│ [content]       16 + 84 →  │ ●  │          │  ┌─ view ──────────────┐   │ ●  │
│                            │    │          │  │ [content]      68 → │   │    │
```

On the left, the inset is added to the view's own 16 pt, so the content stays 16 pt from the status cluster. On the
right, the view has no padding of its own, so the content ends flush against it. Rather than keeping track of which
case a view is in, give it a `gap`:

```tsx
<SafeAreaView granular edges={['top', 'right']} gap={16} style={styles.card}>…</SafeAreaView>
```

With `gap`, each edge gets whichever is larger: the view's own padding, or the overlap plus the gap. The content ends up
16 pt from the OS UI in both cases above, and a view clear of everything keeps its own padding. (It's `spacing` with
`'maximum'` edges.) `spacing` alone adds clearance on top of whatever padding there is.

### Components whose root you don't control

A `SafeAreaView` is a view of its own. Wrapping a component in one changes the layout when the component's root is
what's laid out: a `Pressable` with `flex: 1`, a button stretched by its parent. `useSafeAreaStyle` works on the root
itself. It gives you a style to put on the root and a `probe` to render inside it: an invisible, absolutely positioned
view that fills the root and measures it natively, the same way a `SafeAreaView` measures itself.

```tsx
import { useSafeAreaStyle } from 'react-native-granular-safe-areas';

function Button({ style, children, ...props }: ButtonProps) {
  const safeArea = useSafeAreaStyle({ edges: ['left', 'right'], granular: true, style: styles.button });
  return (
    <Pressable {...props} style={(state) => [styles.button, resolve(style, state), safeArea.style]}>
      {safeArea.probe}
      {children}
    </Pressable>
  );
}
```

It takes the options of `SafeAreaView`, `mode` included, plus `style`: the root's own style, so additive edges can add
to its padding. It returns `style`, `insets` and `probe`. The root must render its children (a `Pressable` and any
`View` do).

On iOS and Android every `SafeAreaView` is a native view that measures itself, and applies `offset` itself, in the
same frame.
Padding and margin change layout, which only React Native can do, so when they change, JS applies them a frame or two
later. A view is measured as laid out, without its own `transform`, so animating it never feeds back into its insets.

### Moving content

`dynamic` makes a view follow its position as it moves, whatever moves it: scrolling, layout changes, gestures, screen
transitions, and animations from Reanimated or Animated's native driver. On iOS it observes the geometry of every view
between itself and the window, and measures itself again in the same frame as one of them moves. On Android it checks
where it is before each frame is drawn. Nothing runs in JavaScript while it moves. In a scroll view it ignores the regions on the scrolling edges, so it
doesn't stick under the home indicator as it scrolls past.

Use `offset` for moving content: it's applied natively, in the same frame. `padding` and `margin` change layout a frame
or two after the view moves, and the layout change ripples to everything around it.

What it costs: one coordinate conversion, about a microsecond, whenever the view or one of its ancestors moves, and
after each React Native mounting transaction (for every `SafeAreaView`). A list with 300 granular views, half of them
dynamic, scrolled as fast as it goes, spends 1 to 4% of the main thread on them on the iPhone Duo simulator.

### Animating with Reanimated

`react-native-granular-safe-areas/reanimated` is an optional entry point; the main entry never imports Reanimated.
`AnimatedSafeAreaView` takes everything `SafeAreaView` takes, plus:

- `transition` animates every change of the insets with any Reanimated animation, for `offset` and `padding`:

  ```tsx
  import { AnimatedSafeAreaView } from 'react-native-granular-safe-areas/reanimated';
  import { withSpring } from 'react-native-reanimated';

  function spring(to: number) {
    'worklet';
    return withSpring(to);
  }

  <AnimatedSafeAreaView dynamic mode="offset" edges={['left', 'right']} transition={spring} style={styles.badge}>
    <Text>Check-in open</Text>
  </AnimatedSafeAreaView>
  ```

- `insets` hands you the insets as a shared value, for animations of your own. Use it with `mode="none"`:

  ```tsx
  const insets = useSharedValue({ top: 0, right: 0, bottom: 0, left: 0 });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(-insets.value.right) }],
    opacity: withTiming(insets.value.right > 0 ? 0.9 : 1),
  }));

  <AnimatedSafeAreaView dynamic mode="none" insets={insets} style={[styles.badge, style]} />
  ```

The native view reports new insets as an event that Reanimated handles on the UI thread as it's dispatched, the
same way `useAnimatedScrollHandler` handles scrolling, so the animation starts on the next frame without a trip through
JavaScript. `margin` changes the layout around the view, so it changes without animating.

### Sheets, modals and overlays: what covers a view

A view only keeps clear of what can actually cover it:

- **System UI** is drawn on top of everything: the status bar and the iPhone Duo's status cluster, cameras and the
  Dynamic Island, the home indicator. Every view avoids it.
- **App UI** (navigation and tab bars, the Duo's vertical bar items, the system back button, and your own accessories)
  only covers what's drawn beneath it.

A sheet or modal is drawn on top of the screen it came from, and so is a bottom sheet or overlay drawn in JavaScript at
the root of the app. So content in a sheet ignores the tab bar and the accessories of the screen underneath, and still
keeps clear of the home indicator:

```
A tab screen with a boarding pass button          The same with a sheet over it
┌─────────────────────────┐                       ┌─────────────────────────┐
│ list ...                │                       │ list ...                │
│ last card               │ ← the list ends       ├─────────────────────────┤
│ [ boarding pass ]       │   above all three     │ sheet                   │
│ [ Trips  Probe  Me ]    │                       │ [ Done ]                │ ← 34 pt: the home
│          ───            │                       │          ───            │   indicator only
└─────────────────────────┘                       └─────────────────────────┘
```

On the iPhone Duo, a sheet covers the vertical tab bar in the column, so content in it uses the full width. A
full-screen modal reaches up to the status cluster, which is drawn on top of it, so it keeps clear of that.

A view is also only seen inside its clipping ancestors (a sheet, a scroll view, `overflow: hidden`), and what can't
reach that area can't cover it. A sheet that starts below the Duo's status cluster has nothing to avoid in the column,
even avoiding whole bands, and a list only keeps clear of what's beside its own scroll view.

Native sheets and modals are measured where they come to rest while they're still sliding in, so their content is right
before it's on screen.

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

The view measures its own box, so in a tab screen the list ends above the tab bar and your accessories, and in a sheet
only above the home indicator. It's zero outside a `SafeAreaView`, and inside one in `offset` mode, which moves as a
whole.

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
```

Describe the position the way you would absolutely position the element on the screen. Missing sides stretch to the
edges, so `{ top: 0, height: 56 }` is a full-width strip, and with no placement at all you get the same insets as
`useSafeAreaInsets()`. Nothing tells it the element is in a scroll view, so say so with `scrollable: 'vertical'` or
`'horizontal'`.

### Regions and the system controls strip

`useSafeAreaRegions()` returns what the OS and the app draw over, on the screen:

```ts
type SafeAreaRegion = {
  kind: 'status' | 'cutout' | 'controls' | 'accessory' | 'fold' | 'inset';
  edge: 'top' | 'right' | 'bottom' | 'left' | null; // the edge it hugs; null for a floating one (a fold)
  side?: 'top' | 'right' | 'bottom' | 'left'; // for a corner region, the other edge it hugs
  frame: { x: number; y: number; width: number; height: number };
  owner?: number; // the view drawing app UI; absent for system UI, which covers everything
};
```

| Kind | What it is |
| --- | --- |
| `status` | The status bar and what's in it: time, signal, battery. On the iPhone Duo, the whole status cluster |
| `cutout` | A camera or sensor housing outside the bands: a punch-hole, the Dynamic Island, the iPhone Duo's camera |
| `controls` | Controls drawn over the app: UIKit's navigation, tab and tool bars, the Duo's vertical bar items, an iPad window's controls, the system back button |
| `accessory` | Your own UI floating over the content, marked with `SafeAreaAccessory` |
| `fold` | A fold or hinge |
| `inset` | A safe-area inset band the platform didn't break down further, avoided as a whole |

`useSystemControls()` describes the strip along one edge where the system puts its controls and yours may join (the
iPhone Duo's vertical bar, or the caption bar of an Android window in desktop windowing that the app draws under), or
returns `null`: its `edge`, the `strip`, the `occupied` stretches (the status cluster, the bar items, the window
buttons, the system back button), the `free` ones, the system's `itemSize`, and the `center` line its items are
centered on. Most apps never need it.

`useTabBarEdge()` says where the system puts a tab bar here, whether or not the app has one: `'right'` or `'left'`
on the iPhone Duo (closed, or open in landscape), `'top'` in an iPad window of regular width, and `'bottom'`
everywhere else, Android and the web included. Use it to put a tab bar of your own where the system's would go.

**Floating UI above whichever tab bar there is** doesn't need it, though. UIKit's tab bar is a `controls` region
wherever it is, so a granular view in `offset` mode moves clear of it by exactly as much as it overlaps:

```tsx
// Pinned to the bottom right. Over a bottom tab bar it moves up; on the Duo, where the tab bar is in the column
// beside it, it moves left; with no tab bar it stays.
<SafeAreaView granular mode="offset" edges={['bottom', 'right']} spacing={8} style={styles.fab}>
  <ScanButton />
</SafeAreaView>
```

A tab bar you draw yourself counts too once it's a `SafeAreaAccessory`.

### iPad windows

An iPad window that doesn't fill the screen has its controls (close, minimize, arrange) in its top-left corner, over
the app. UIKit's safe area leaves them out, and a navigation bar moves its items past them, but a header drawn in
JavaScript slides under them. Here they're a `controls` region in the corner, and a view gets out of their way the way
UIKit's own bars do:

- **Level with them**, like a header or a button in it: the view moves sideways, past the controls, and keeps its
  height. Moving down would take more than half of it.
- **Taller than that**, like a whole screen or a sidebar: the view starts below them.

```
iPad, a window smaller than the screen
┌─(●●●)─[‹ Trip]──[Sign in]─┐  a header: its content moves past the controls
│                           │
│ ┌───────────────────────┐ │  a screen below the header: nothing to avoid
```

Edges you leave out decide it too: a header without `'left'` in its `edges` moves down instead. When the window fills
the screen, the controls are in the status bar and there's nothing to avoid.

### System back button

UIKit puts a navigation controller's back button in its own controls: on the iPhone Duo, at the top of the vertical
bar, right below the status cluster. Screens with a custom header (`headerShown: false`, JavaScript navigation, a
floating button over a hero image) don't get it. Wrap your own back button in `SystemBackButton`:

```tsx
import { SystemBackButton } from 'react-native-granular-safe-areas';

<SystemBackButton onPress={() => navigation.goBack()}>
  <MyBackButton onPress={() => navigation.goBack()} />
</SystemBackButton>
```

Where the system has a place for it (the Duo closed, or open in landscape), your button is hidden and a system glass
button shows there, at the size UIKit uses for its own (`48 × 48`, centered on the camera). Everywhere else, including
a regular iPhone and the Duo open in portrait, your button stays as it is.

- **Part of the screen.** The button is drawn in the screen it belongs to, so it slides in and out with it.
- **Follows the status cluster**, and moves when it grows (a Live Activity).
- **Other views avoid it** as a `controls` region; a sheet over it ignores it.
- **One at a time.** Every screen can offer one; the most recent screen that is showing wins. Screens below the top of
  a stack and unselected tabs drop out on their own, because UIKit takes their views out of the window. So does a
  screen that stays mounted but hidden: `opacity: 0` or `display: 'none'` on it or any ancestor, checked after every
  React Native update. An opacity animated on the UI thread counts from the next update; for anything else that keeps
  a mounted screen from the user, turn its button off with `enabled`.
- **Gives way to UIKit.** If a native header already shows its back button there, your own stays.

| Prop | Default | |
| --- | --- | --- |
| `onPress` | | Called when the system's button is pressed |
| `enabled` | `true` | Turn the system's button off, e.g. while the screen can't go back |
| `icon` | `'back'` | `'back'` (chevron) or `'close'` (cross, for modals) |
| `accessibilityLabel` | `'Back'` / `'Close'` | |
| `children` | | Your own back button, shown where the system has no place for one |
| `keepSpace` | `false` | Keep your button laid out (invisible, untouchable, hidden from screen readers) while the system shows its own, instead of unmounting it, so a header row keeps its title where it was. Your button is wrapped in a plain `View` |

When hiding the children isn't enough (a header title that should move over, say), use the hook. It returns `shown`,
and a `button` element to render anywhere in the screen:

```tsx
const back = useSystemBackButton({ onPress: navigation.goBack });
return (
  <Header>
    {back.button}
    {back.shown ? null : <MyBackButton />}
    <Title style={{ marginLeft: back.shown ? 16 : 0 }} />
  </Header>
);
```

### Options

| Option | Default | |
| --- | --- | --- |
| `edges` | all four | Edges the element may be pushed in from, as a list or per edge |
| `granular` | `false` | Avoid only the regions it overlaps, not whole bands |
| `dynamic` | `false` | `SafeAreaView` only. Follow the view as it moves; implies `granular` |
| `mode` | `'padding'` | `SafeAreaView` only. `padding`, `margin`, `offset` or `none` |
| `spacing` | `0` | Extra clearance around each region, in points |
| `gap` | | `SafeAreaView` and `useSafeAreaStyle`. Keep the content this far from what it avoids, counting the view's own padding |
| `avoid` | everything except `'fold'` | Region kinds to avoid: `inset`, `status`, `cutout`, `controls`, `accessory`, `fold`. `[]` avoids nothing |
| `underlying` | `false` | `SafeAreaView` only. Also avoid app UI drawn beneath the view |
| `onInsetsChange` | | `SafeAreaView` only. Called with the view's insets, once measured and whenever they change |
| `scrollable` | | `useSafeAreaInsetsFor` only. `'vertical'` or `'horizontal'` |

Folds aren't avoided by default: a full-width header that spans a book fold shouldn't be squeezed onto one half. Add
`'fold'` to `avoid` for small controls you want off the hinge.

### Staying in sync

The regions follow the system UI as it changes, and every view and hook updates with them:

| Change | How it's noticed |
| --- | --- |
| Rotation, folding and unfolding, Split View, window resizing | Layout, safe-area and trait callbacks |
| The camera area growing or shrinking (Dynamic Island with a Live Activity), the fold becoming active, the inner camera turning on | UIKit's reserved-region change tracking |
| A UIKit bar growing, shrinking, moving, hiding or fading: vertical bar items added or removed, a large title collapsing, a tab bar hidden | Key-value observation of the bar, as soon as the change starts |
| Bars appearing or disappearing with navigation or a tab switch | Re-scan when safe-area views mount, and a re-scan once a second while UIKit bars or a side column are present |
| Anything that changed while the app was in the background | Re-scan when the scene becomes active |

The once-a-second re-scan is one walk of the view hierarchy, batched by the system with other wake-ups. It doesn't run
at all in apps without UIKit bars (JavaScript navigation) on devices without a side column. To pick up a change sooner,
for example right after your own navigation, call `refreshSafeAreas()`.

UIKit bars count as regions wherever they are, not just in the Duo column, so an element under a transparent navigation
bar is pushed below it, and moves as the bar grows or shrinks. Don't wrap components that render *inside* a native
header (custom `headerRight` content): they overlap the bar on purpose.

## Adopting in an existing app

An app that already handles the top and bottom with `useSafeAreaInsets()` doesn't have to change any of that. Keep
those callers, and let this library handle only the side columns, where the iPhone Duo's status cluster and vertical
bar are. `SafeAreaDefaults` sets that once instead of on every view:

```tsx
import { SafeAreaDefaults } from 'react-native-granular-safe-areas';

<SafeAreaDefaults edges={['left', 'right']} granular gap={16}>
  <App />
</SafeAreaDefaults>
```

Every `SafeAreaView`, `SafeAreaAccessory`, `AnimatedSafeAreaView` and `useSafeAreaStyle` inside it takes these unless
it says otherwise; nested defaults add to the ones around them. It isn't a provider: it measures nothing. Then:

1. Swap the import of `SafeAreaView` from react-native-safe-area-context for this library's. Its `edges` are still
   respected, so views that pass their own keep behaving as before.
2. Put `SafeAreaView`s (or `useSafeAreaStyle`) on what reaches the side edges: headers, bars, rows, floating buttons.
   Anything in a scroll view avoids the whole side column, so lists line up.
3. Wrap custom back buttons in `SystemBackButton`.

Elsewhere the side insets are a phone's in landscape (the camera side) and an Android cutout, which these views now
keep clear of as well.

## Previews, tests and debugging

`GranularSafeAreaProvider` is optional. Use it to:

- **simulate a device**: `mock={fixtures.iPhoneDuoOuterPortrait}` lays out for the Duo on any device or in a browser.
  `fixtures` has the Duo closed in portrait (plain, with native tabs, with a native header) and landscape, open in
  landscape and portrait, folded like a book, a regular iPhone, an iPad full screen and in a smaller window, and a
  Pixel 10 in portrait and landscape, recorded on the simulators and the emulator.
- **debug**: `debug` draws the regions over the app, labelled with their kinds, with a caption saying how many there
  are. Without a provider, render `<GranularSafeAreaDebugOverlay />` last in the app's root view. Native sheets and
  modals are drawn above it; render one in them too.
- **compare**: `granular={false}` makes every view inside behave like a regular safe area.
- **scope a custom overlay**: views and `useSafeAreaInsetsFor` inside measure relative to it. Native modals and sheets
  don't need this.

```tsx
import { fixtures, GranularSafeAreaProvider } from 'react-native-granular-safe-areas';

<GranularSafeAreaProvider mock={__DEV__ ? fixtures.iPhoneDuoOuterPortrait : undefined} debug={__DEV__}>
  <App />
</GranularSafeAreaProvider>
```

**Tests.** In Jest there's no native side; swap in the mock, which renders plain views with no insets, and
safe-area-context's own mock, which it re-exports:

```ts
// jest.setup.ts
jest.mock('react-native-granular-safe-areas', () => require('react-native-granular-safe-areas/jest'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
```

By default it's a device with nothing to avoid. To test a layout such as the iPhone Duo's, give it one of `fixtures`,
for a subtree or for the whole test:

```tsx
import { fixtures, GranularSafeAreaProvider } from 'react-native-granular-safe-areas';
import { mockSafeAreaMetrics } from 'react-native-granular-safe-areas/jest';

render(
  <GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>
    <TripScreen />
  </GranularSafeAreaProvider>
);

// or, for everything rendered from here on:
beforeEach(() => mockSafeAreaMetrics(fixtures.iPhoneDuoOuterPortrait));
afterEach(() => mockSafeAreaMetrics(null));
```

The hooks then return what they would on that device: `useSystemControls`, `useSafeAreaRegions`, `useTabBarEdge`,
`useSafeAreaInsetsFor`. `SystemBackButton` hides your button where the system would show its own, and renders a
pressable stand-in with the test ID `SystemBackButton` that calls the `onPress` of the screen that would get it, so
`fireEvent.press(screen.getByTestId('SystemBackButton'))` works. Views stay plain `View`s: nothing is laid out in
Jest, so there's nothing for them to measure.

The geometry behind the components (`buildRegions`, `safeAreaViewInsets`, `parseMetrics`, ...) is exported from
`react-native-granular-safe-areas/testing`, for tests and tools.

**Diagnostics.** `getDiagnostics()` returns everything the native side can see for every window: insets,
corner-adapted insets, the status bar, reserved regions (including inactive ones and their margins),
`verticalBarEdge`, bar layout regions at several widths, the view controller tree, and the UIKit views near each side
edge. Attach it to bug reports. The example app's **Probe** screen collects it, logs it to the Metro terminal, and can
share it.

## Platforms

| Platform | What it knows | Views |
| --- | --- | --- |
| iOS 27.1+ | The status cluster, cameras, the iPhone Duo's vertical bar and its items, UIKit bars anywhere, folds | Native |
| iPadOS 26+ | Regular bands, UIKit bars, and the window controls of a window smaller than the screen | Native |
| Older iOS | Regular bands, plus UIKit bars | Native |
| Android | The camera and the rounded corners of a band made only of the display cutout (a phone in landscape), the window buttons of a caption bar the app draws under (desktop windowing, Android 15+), folds. Bands with the status or navigation bar in them stay whole | Native |
| Web | Regular bands from `env(safe-area-inset-*)`, and recorded devices through `mock` | Measured from JS |

## How it works

The native side reports raw facts about the app's window: the safe-area insets, the `verticalBarEdge` trait, the status
bar frame, UIKit's reserved regions (`UIView.reservedRegions(kind:options:)`), the layout region for a bar on the
vertical bar edge, an iPad window's controls (from the corner-adapted safe area), and the frames of every UIKit bar in
the window, each with the view that draws it. An empty view
behind everything in the window follows them; a `GranularSafeAreaProvider` does the same for itself. The JavaScript
side turns those facts into regions:

1. Every non-zero inset starts as a full-length band.
2. The band on the vertical bar edge is replaced by a `status` region (from the top down to wherever the status
   cluster ends) and a `controls` region for each bar item in it.
3. Active cameras outside the bands become `cutout` regions, other UIKit bars become `controls` regions, and an
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
  the tab bar platter. When a container is found, an empty bar really is empty, so the column is split even on a native
  stack's root screen.
- **Tab bar controllers** keep an empty, full-height `UITabBar` in the column while the tabs are drawn in the platter;
  the library ignores it.
- **Bar items are centered on the camera** (x 418), not on the column (x 424), which is where the system back button
  goes too.

On Android, the native side reports the window's insets broken down by what's in them (the status and navigation
bars, a caption bar, the display cutout), the cutout's camera housings, the window buttons of a caption bar (Android
15+), folds (Jetpack WindowManager) and the display's rounded corners. Bands with the status or navigation bar in them
stay whole: those bars span the edge. A band made only of the display cutout, such as the camera side of a phone in
landscape, becomes the camera housing and the rounded corners at its ends. A top band made only of a caption bar the
app draws under becomes its window buttons. What the Pixel 10 emulator showed: in landscape with the camera on the
left, the left band is 54 pt of cutout, with the camera at y 185–227 and 50 pt corners at both ends.

Each `SafeAreaView` is a native view that gets the regions as props. When it's laid out, it works out which app UI is
drawn on top of it (where their branches of the view hierarchy meet, which comes later, or has the higher `zIndex`),
where it can be seen (its clipping ancestors), its position as laid out (React Native's views without the transforms
React Native gives them, UIKit's containers where UIKit has them), and the scroll views around it, and from that how
far each edge must move in to clear what covers it. It applies `offset` itself and reports the insets to JS for
`padding`, `margin` and `none`. Before the first frame, JS measures it once with `getBoundingClientRect()`, from React
Native's layout, and the native view starts from that.

`useSafeAreaInsetsFor` computes the same thing from the placement you gave it, and re-renders only if its insets
changed. Where there's no native view, `SafeAreaView` measures itself from JS the same way, when it mounts, when its
layout changes and when the regions change.

## Example app

```sh
pnpm install
pnpm example web     # iPhone Duo simulation in the browser
pnpm example ios     # Xcode 27.1 or newer; pick the iPhone Duo simulator in Device Hub
pnpm example android # an emulator with a punch-hole camera, such as a Pixel
```

The example has:

- a trip screen modelled on a real app that broke on the Duo: default rows, granular floating controls, dynamic badges
  that spring in, a boarding pass bar as an accessory, a manual header and the system back button
- a JS bottom sheet, a native form sheet and a full-screen modal, opened from the trip screen: each overlay's footer
  only keeps clear of what covers it
- a trip details screen with a floating back button over a hero picture, which becomes the Duo's back button
- a settings list: rounded rows that clip themselves, kept in line with `gap`, and a button whose root is a
  `Pressable`, using `useSafeAreaStyle`
- the same trip screen inside native tabs
- edge markers, a marker every 40 pt down the right edge that shows which ones move as the system UI changes
- moving elements: default, granular, dynamic and springy pills moved by a Reanimated animation
- native header items you can add and remove, to watch the vertical bar grow and shrink
- the probe

It runs without a provider. Switch between granular, regular-band and no avoidance to compare, and turn on the regions
to see them. In the browser, **Simulate a Live Activity** grows the camera area to show everything following it.

## Related

- [react-native-safe-area-context](https://github.com/appandflow/react-native-safe-area-context): regular insets per
  edge, plus corner-adapted insets since 5.11. This library uses it and re-exports it.
- [react-native-reserved-regions](https://github.com/appandflow/react-native-reserved-regions): raw camera and fold
  frames, without the status bar, system bars, or anything that moves views.
- [@garrettmacmac/react-native-duo](https://github.com/garrettmac/react-native-duo): a full iPhone Duo layout toolkit
  with its own bars and panes.

## License

MIT
