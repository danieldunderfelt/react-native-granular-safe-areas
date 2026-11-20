# react-native-granular-safe-areas: plan

## The problem

On the iPhone Duo outer display (and the inner display in landscape), the status bar, the camera and the system's
vertical bars (tab bar, toolbar, navigation items) all sit in one column on the right edge. UIKit reports this as a
plain inset: about `{ top: 0, right: 84, bottom: 34, left: 0 }` on the outer display, portrait. The column is only
partly occupied, though:

```
Duo outer display, portrait (466 x 678 pt). Positions estimated from the Finnair screenshot.
┌────────────────────────────┬──────┐
│ header       [Log in]  ←───┼─ ● ──┤  0–~205 pt  camera + Dynamic Island + status cluster
│ card ............ [badge]←─┼─5G ──┤
│                            │      │  ~205–~440  free: content may extend here
│ card                       │      │
│ [HEL–LPA bar ...... ] [QR]←┼─ ⌂ ──┤  ~440–~655  system vertical tab bar (native tabs)
│                [feedback]←─┼─ ☺ ──┤
└────────────────────────────┴──────┘  bottom 34: home indicator
```

There are two ways to handle this today, and both are poor:

- Pad everything by 84 pt. You lose 18% of the width, and backgrounds stop short of the edge. The tlon-apps PR below
  does this.
- Ignore the inset, as the Finnair app does. Then buttons end up under the status cluster and the tab bar.

The library's job: know **where** the OS UI actually is, and push in only the elements that overlap it. Backgrounds keep
extending to the edge. It also covers every other safe-area need, so an app imports one package.

## What already exists

| Project | What it does | What it leaves out |
| --- | --- | --- |
| [react-native-safe-area-context](https://github.com/appandflow/react-native-safe-area-context) 5.11.1 | Rectangular insets per edge, `SafeAreaView`, nested providers. Since 5.11.0 ([#792](https://github.com/appandflow/react-native-safe-area-context/pull/792)) it also has opt-in corner-adapted insets (`cornerAdaptation`), measured on the Duo. React Navigation and Expo Router read its context. | No regions: one number per edge, so the column is all-or-nothing. |
| [react-native-reserved-regions](https://github.com/appandflow/react-native-reserved-regions) 0.2.0 (App&Flow) | Provider-scoped raw `occlusion`/`division` frames from `UIView.reservedRegions`, plus Android cutouts and folds. New Architecture only. | Geometry only, nothing moves. No status bar, no system bars. Only active regions. First-frame timing depends on an RN PR. |
| [@garrettmacmac/react-native-duo](https://github.com/garrettmac/react-native-duo) | A large Duo toolkit: it draws its own vertical bars (`DuoPage`), pane layouts, and `AvoidReservedRegions`, which moves a control off the fold or a camera. | Opinionated: you adopt its whole layout system. It avoids the fold and cameras, not the status cluster or system bars. Its README says the native code has never been compiled against the 27.1 SDK or run on a Duo. One author, 0 stars. |
| [tlon-apps #6612](https://github.com/tloncorp/tlon-apps/pull/6612) (open) | A real app's fix: pad every screen by the side insets. | Pads the whole column. The author notes that granular placement "would need those reserved-region APIs". |
| [RN #58594](https://github.com/react/react-native/pull/58594), [expo #50343](https://github.com/expo/expo/pull/50343) (both open) | Proposed fold/display-feature APIs. | Not merged; folds only. |

**Conclusion:** nothing does what this library aims to do: treat the status cluster, cameras and system bars as
regions, and push in individual elements, while leaving the safe area untouched on devices it doesn't understand. The
pieces exist: regular insets in safe-area-context, and region frames in UIKit 27.1. So the library builds on
safe-area-context rather than replacing it.

## Platform facts (iOS 27.1, from Apple's docs)

- `UIView.reservedRegions(kind: .occlusion | .division, options: .includeInactive)` returns `frame`, `margins`,
  `isActive` and `kind`. The frames are in the view's own coordinates and already include the margins. The outer camera
  is always active and grows into the Dynamic Island for Live Activities. **UIKit re-runs `updateConstraints()` when the
  regions read there change**, which gives us change observation for free.
- The `verticalBarEdge` trait (`leading`/`trailing`/`unspecified`) gives the preferred bar edge, whether or not a bar is
  visible.
- `UIView.LayoutRegion.bar(onEdge:extent:)` with `edgeInsets(for:)` and `layoutGuide(for:)` returns the place a custom
  bar may occupy (27.1). `.safeArea(cornerAdaptation:)` (26.0) returns corner-adapted insets.
- Bars inside UIKit containers (`UITabBarController`, `UINavigationController`) go vertical. Standalone bars don't.

**Unknowns, answered on the Duo simulator (Xcode 27.2, iOS 27.2, 2026-11-17):**
1. *Does the occlusion region cover the whole status cluster?* Yes. There are two active occlusion regions: the
   camera (`37 × 37` at `399.7, 29.3`) and the whole cluster (`382, 0, 84 × 174` closed in portrait; `867, 0, 84 × 124`
   open in landscape, where there's no camera; `0, 0, 84 × 82` closed in landscape, where the status bar is hidden).
2. *`statusBarFrame` when vertical?* A placeholder: `0, 0, width × 2`. Useless, so it's ignored (anything under 10 pt).
3. *`edgeInsets(for: .bar(onEdge:extent:))`?* Its top is exactly the bottom of the cluster (174 / 124 / 82), and its
   sides center bar items on the camera (x 418), not on the column (x 424). In a sheet below the cluster its top is 0.
4. *How to read the vertical bar?* Bar items live in `_UIFloatingBarContainerView`: a transparent view covering the
   whole navigation or tab bar controller, one per controller. Each item group is a glass capsule inside it
   (`UIPlatformGlassInteractionView`): the back button `48 × 48` at the top of the bar, header items in one capsule
   12 pt below, the tab bar platter at the bottom. A `UITabBarController` also keeps an empty `UITabBar` running the
   full height of the column, which must be ignored. The horizontal `UINavigationBar` stays at `0, 24, width × 58` for
   the title, even though the top inset is 0.

## Design

### Regions, with a "never worse than today" rule

The provider exposes a list of **regions**: rectangles the OS draws over, each tagged with the screen edge it hugs.

```ts
type SafeAreaRegion = {
  kind: 'statusBar' | 'camera' | 'systemBar' | 'homeIndicator' | 'fold' | 'inset';
  edge: 'top' | 'right' | 'bottom' | 'left' | null;
  frame: { x: number; y: number; width: number; height: number }; // provider coordinates
};
```

The regions start as the four regular inset bands (`kind: 'inset'`, the full length of each edge). Native code
**refines** a band, replacing it with the specific regions inside it, only when it knows everything in that band.
That requires all of the following: iOS 27.1 at runtime, `verticalBarEdge` on that edge, and every source verified on a
Duo. Without that, the band stays whole, and `GranularSafeAreaView` behaves exactly like `SafeAreaView`. A device the
library doesn't understand gets today's behavior, never something worse.

### Pushing an element in

For each element, measure its rect in provider coordinates, then intersect it with the regions. Each region that
overlaps the element insets the element's matching edge: a region on the right edge gives `inset.right = elem.maxX -
region.minX`. A region that hugs no edge, such as a fold or a mid-screen camera, moves the element in the cheapest
allowed direction. The result is a per-element set of insets: a safe area for that one element.

- `mode="padding"` (default): for containers such as headers. The background stays under the column and the children
  move in.
- `mode="offset"`: a translate, for floating buttons and badges. The whole element moves.
- The element's own adjustment is subtracted before each recompute, so the result can't feed back into itself (no
  oscillation with auto-sized boxes).
- Measuring: `ref.getBoundingClientRect()` in `useLayoutEffect`. It's synchronous on the New Architecture (RN 0.82+),
  so the first frame is already correct and nothing visibly jumps. The element re-measures on its own `onLayout`, on a
  region change, and on a provider layout change.

### Scrolling content

Inside a scroll view, every element on the right edge eventually passes under both the cluster and the tab bar, and
Apple's HIG asks for scrollable content to stay inset. So scrolling content keeps the regular band inset, and its
backgrounds may still extend to the edge. The granular behavior is for fixed UI: headers, floating buttons, bottom
bars, overlays, maps, cameras, and full-screen layouts such as games and calculators. `GranularSafeAreaView` takes a
`scrollable` prop (or reads a context from wrapped scroll views) and switches to band behavior there.

Elements the developer picks can opt into following their live position instead: `<GranularSafeAreaView dynamic>`.
On iOS that's a native view (`GSADynamicView`) that measures itself in the provider on the UI thread: on KVO of
`contentOffset` for every scroll view between it and the provider (same frame as the scroll), and after every
mounting transaction (`RCTMountingTransactionObserving`). It gets the regions as props, already filtered by `avoid`,
grown by `spacing` and without the scrolling edges. `offset` is a layer transform composed on top of React Native's
own; `padding` is reported to JS, since only React Native can change layout. The web re-measures on a capturing
document scroll listener, once per frame. Native-driven animations of ancestors aren't followed.

### API sketch

```tsx
import {
  GranularSafeAreaProvider, GranularSafeAreaView, useGranularSafeAreaInsets,
  useSafeAreaRegions, GranularSafeAreaDebugOverlay,
  // re-exported from react-native-safe-area-context, so one import covers everything:
  SafeAreaProvider, SafeAreaView, useSafeAreaInsets, initialWindowMetrics,
} from 'react-native-granular-safe-areas';

<SafeAreaProvider>
  <GranularSafeAreaProvider>
    <App />
    {__DEV__ && <GranularSafeAreaDebugOverlay />}  {/* draws the regions and flags elements that overlap them */}
  </GranularSafeAreaProvider>
</SafeAreaProvider>

// Header: the background runs under the column; "Log in" moves left only because the cluster is there.
<GranularSafeAreaView edges={['top', 'right']} style={styles.header}>…</GranularSafeAreaView>

// Floating QR button: moved clear of the system tab bar, by exactly the overlap.
<GranularSafeAreaView mode="offset" style={styles.fab}><ScanButton /></GranularSafeAreaView>

// Custom layouts: per-element insets or raw regions.
const insets = useGranularSafeAreaInsets(ref, { edges: ['right'] });
const regions = useSafeAreaRegions();
```

Tests and previews use `<GranularSafeAreaProvider mock={fixtures.iPhoneDuoOuterPortrait}>`. It injects recorded
regions, so you can lay out for the Duo on any device or on the web.

### Architecture

- **JS/TS core**: region refinement, per-element geometry, provider, view, hooks, debug overlay. Pure functions where
  possible, so the logic is unit-tested against recorded Duo fixtures.
- **iOS** (ObjC++): a Fabric provider view, plus a TurboModule that returns the initial window regions synchronously,
  so the first frame is right, like `initialWindowMetrics`. The provider converts window regions into its own
  coordinates, so modals and sheets work with a nested provider. It reads reserved regions in `updateConstraints` (for
  observation), `verticalBarEdge` in the trait change callback, and the status bar and bar frames on layout. It emits an
  event only when something changed. iOS 27.1 symbols sit behind `__IPHONE_OS_VERSION_MAX_ALLOWED >= 270100` and
  `@available`, so the library builds with older Xcode and reports bands only.
- **Android** (Kotlin, later): `DisplayCutout.boundingRects` (a landscape punch-hole is exactly a granular region in a
  full-height inset band), and on API 35+ `WindowInsets.getBoundingRects()` for caption bars. Otherwise bands.
- **Web**: bands from safe-area-context (`env(safe-area-inset-*)`).
- **Dependencies**: peer dependency on `react-native-safe-area-context` (≥ 5.11), which apps already have through
  React Navigation and Expo Router. New Architecture only, RN ≥ 0.82. Scaffolded with `create-react-native-library`,
  not as an Expo module, so bare apps don't pull in expo-modules-core. It works in Expo dev builds as-is.

## Phases

| # | Deliverable | Where it's verified |
| --- | --- | --- |
| 0 | **Native probe**: a screen in the example app that dumps JSON. It covers insets (regular and corner-adapted), `statusBarFrame`, occlusion and division regions (including inactive ones, with margins), `verticalBarEdge`, `edgeInsets(for: .bar(onEdge:extent:))` at several extents, and every UIKit view that intersects the bar column (class chain and frame). Run it on a plain root, with a native-stack header, with native tabs, and in a sheet, across the outer/inner, portrait/landscape, Split View and partially-folded poses, with an iPhone 18 Pro as the baseline. The output answers the four unknowns and becomes the test fixtures. | Written here, run on the Mac (Xcode 27.1 Duo simulator) and later on a device |
| 1 | **JS core**: types, refinement, per-element geometry, provider with `mock`, `GranularSafeAreaView`, hooks, debug overlay, re-exports. Jest tests against the Duo fixtures (estimates until Phase 0 lands). An example app that runs on the web with a "simulate iPhone Duo" switch. | Fully on Linux, including a browser preview |
| 2 | **iOS regions**: the provider view and TurboModule. Camera/island from occlusion regions, the status cluster from whichever source Phase 0 confirms, `verticalBarEdge`, bands from insets, change events, initial metrics. | Mac: simulator, then device |
| 3 | **iOS system bars**: frames of the vertical tab bar and header items (react-native-screens native tabs and stack), using the approach Phase 0 picks. This is what fixes the QR and "Give feedback" buttons in the screenshot. | Mac |
| 4 | **Android**: cutout bounding rects, `getBoundingRects` on API 35+, folds as divisions. | Linux (emulator) |
| 5 | **Hardening**: re-render cost (selector subscriptions, so a region change only re-renders the elements it affects), README, example gallery, publishing. | Both |

I can do Phase 1 and the written half of Phases 0 and 2 here. Your first Mac session would be: build the example, run
the probe on the Duo simulator, and send back the JSON.

## Status (2026-11-17)

| Phase | State |
| --- | --- |
| 0 Probe | Done on the Duo simulator in every pose; the four unknowns above are answered and the fixtures are recorded values. |
| 1 JS core | Done. Automatic API (`GranularSafeAreaView`, `useGranularSafeArea` props) and manual API (`useGranularSafeAreaInsets(placement)`), on a store outside React state. 72 unit tests. |
| 2 iOS regions | Done, verified on the simulator: compiles cleanly with Xcode 27.2; the column splits into the status cluster and bar items in every pose, and stays whole elsewhere (checked on an iPhone 18 Pro simulator). |
| 3 iOS system bars | Done, verified on the simulator: floating bar container items (back button, header items, tab bar platter), `UITabBarController`'s placeholder `UITabBar` ignored. Adding and removing header items is picked up within 0.4 s. |
| 3b Duo back button | Done, verified on the simulator: `VerticalBarBackButton` / `useVerticalBarBackButton`, a native glass button (`GSABarButtonView`) at UIKit's back button slot, screen visibility from a native anchor (`GSAAnchorView`). Stacks, tabs, unfolding and the outer display in landscape (bar on the left) all checked. |
| 3c Dynamic elements | Done, verified on the simulator: `<GranularSafeAreaView dynamic>` (`GSADynamicView`) follows scrolling in the same frame and layout changes after each mounting transaction; `offset` natively, `padding` through JS. Also fixed: `scrollable` content measured while scrolled out of view got no insets. |
| 4 Android | Not started; Android gets regular bands from safe-area-context. |
| 5 Hardening | Not started. |

### Not verified yet

- **A physical Duo.** Everything above ran on the simulator only.
- **Live Activities.** The simulator has no Clock app to start one. Unit tests cover the cluster growing and the back
  button following it; on the device, start a timer and watch **Edge markers** and the back button on **Trip screen**.
- **Split View** on the inner display (the bar on the left app's left edge).

### First device session

1. Build the example for the Duo (`pnpm example ios --device`).
2. **Trip screen** and a trip's details, closed: the custom back buttons are replaced by the glass button below the
   status cluster. Tap it. Open the device: in landscape the button moves below the shorter cluster on the inner
   display; turn it to portrait and the custom buttons come back.
3. **Trip screen in native tabs**: the button and the tab bar share the bar; switch tabs and it goes away.
4. Start a timer (Live Activity) and check that the status region, the markers and the back button move down.
5. If something is off, open **Probe**, tap **Collect diagnostics**, and send the JSON (logged to Metro with the prefix
   `[granular-safe-areas probe]`, or shared from the button).

## Next: a generic, zero-config API (agreed 2026-11-20)

The target API is in [docs/api.md](docs/api.md); it becomes the README once it's built. Nothing is published, so
nothing old is kept around. In short:

- **Nothing to set up.** No providers at the root or in modals; `GranularSafeAreaProvider` becomes optional (mocks,
  `debug`, `granular={false}`, scoping a custom overlay).
- **One component.** A drop-in `SafeAreaView`, prop-compatible with safe-area-context's, plus `offset` and `none`
  modes. The props-spreading hook goes; the manual hook stays as `useSafeAreaInsetsFor`.
- **Bands by default, granular and moving on request.** Every view measures itself and works out the inset it needs,
  when it's laid out. By default it avoids the whole band on each edge it overlaps, so it stays clear of the OS UI
  wherever it scrolls along that edge. `granular` avoids only the regions it overlaps where it's laid out (fixed UI).
  `dynamic` follows the view as it moves and avoids only what it overlaps right now; movement is a design decision, so
  it's opt-in. Scroll views are detected: their scrolling-edge bands are left to the content inset, and `granular`
  acts like the default there.
- **Reanimated, optionally.** A `/reanimated` entry with `AnimatedSafeAreaView`: `transition` animates inset changes
  with any Reanimated animation, `insets` exposes them as a shared value for animations of your own.
- **Generic concepts.** Region kinds `status`, `cutout`, `controls`, `fold`, `inset`; `useSystemControls` instead of
  the vertical bar; `SystemBackButton` instead of `VerticalBarBackButton`. Platform-specific facts go into per-platform
  builders on a shared core.
- **More platforms on the same model.** Android natively (cutouts, caption bars in desktop windowing, folds), iPad
  window controls, and possibly the title-bar area of desktop PWAs.

### Architecture

- **Every `SafeAreaView` is a native view** on iOS and Android (JS-measured on the web). It measures its layout box,
  without its own transform, in its context, and applies `offset` itself. Default and `granular` views measure only
  when laid out (mount, their own layout, mounting transactions that move them, OS UI changes); a default view's
  result changes only when the bands do, so a bar appearing in the column re-renders nothing. `padding` and `margin` are reported to JS,
  the only one that can change layout; on mount JS measures once so the first frame is already right.
- **Contexts instead of providers.** A native observer per window does what `GSAProviderView` does now. Each view
  belongs to its presentation (the root, or a presented sheet or modal), found by walking up natively, or to the
  nearest optional provider. Native sends each context's metrics to JS through TurboModule events; JS builds the
  regions (the tested TypeScript core stays the one source of the geometry) and hands them back to a native registry
  that views read. Region changes re-render nothing.
- **Dynamic tracking without polling.** A dynamic view observes the geometry (`position`, `bounds`, `transform`) of
  every layer between it and its context with KVO, and recomputes once per frame in a run-loop observer that runs just
  before Core Animation commits. That covers scrolling, layout, gestures, UIKit transitions, and Reanimated and
  Animated native-driver animations, in the same frame. To verify first: that all of those go through the layer's
  setters, and the cost with many views. Fallback: today's scroll KVO and mounting-transaction updates, plus an opt-in
  per-frame check for animated containers. Android: `ViewTreeObserver` pre-draw and scroll listeners.
- **Reanimated through events.** The native view emits an event when its insets change. Reanimated runs worklet
  handlers for native events on the UI thread as they're dispatched (as for `useAnimatedScrollHandler`), so the
  `/reanimated` entry writes them into a shared value and drives `transition` with no trip through JS. In that mode
  the view measures without its own transform, so an animation can't feed back into the insets.
- **The system back button lives in the screen.** `SystemBackButton` renders a native host that draws the glass
  button at the system's slot, so it moves with screen transitions and disappears with its screen. No registry or
  anchor.

### Phases

| # | Deliverable | Verified on |
| --- | --- | --- |
| 1 | **API spec**: [docs/api.md](docs/api.md), for approval before any code. **Approved.** | Review |
| 2 | **iOS, one native view**: every `SafeAreaView` native; layout-box measurement; bands by default, `granular` opt-in, scroll views detected (scrolling-edge bands dropped, out-of-sight content measured where it will be); opt-in `dynamic` with the event-driven tracking above; modes `padding`, `margin`, `offset`, `none`; `onInsetsChange`; `edges` object form. Remove the props hook. | Duo simulator, plus a list with many views for cost |
| 2b | **What covers a view**: a view avoids system UI, and app UI only where it's drawn on top of it (sheets and modals, native or JS, ignore the tab bar and accessories beneath them); only where it can be seen counts. `SafeAreaAccessory`, `useSafeAreaViewInsets`, `underlying`. One provider covers its whole window. | iPhone 18 Pro and Duo simulators |
| 3 | **Reanimated entry**: `/reanimated`, optional peer dependencies, `AnimatedSafeAreaView` with `transition` and `insets`; the badge in the example springs in. | Duo simulator |
| 4 | **iOS, zero-config**: no root provider either (a window observer, TurboModule events, a native region registry), optional provider (`mock`, `debug`, `granular`, scope), `SystemBackButton` hosted in the screen. Sheets and modals already need no provider since 2b. Riskiest phase: it adds a hidden view to each window, and a sheet's first frame may take one JS round trip. | Stacks, tabs and a sheet with no provider, on the Duo simulator |
| 5 | **Generic model**: platform-tagged metrics with per-platform builders on a shared core; the new region kinds; `useSystemControls`. Probe an iPad simulator in windowed mode, then support its window controls. | Unit tests, iPad simulator |
| 6 | **Android, native**: metrics (cutout bounding rects, caption-bar bounding rects on API 35+, folds through Jetpack WindowManager), the native view and its tracking, events for Reanimated. Fixtures recorded on the Pixel_10 emulator (punch-hole) and a tablet emulator in desktop windowing (caption bar). | Emulators |
| 7 | **Polish**: `/jest` mock, `/testing` exports, web scroll-view detection (and maybe the PWA title-bar area), README from the spec, an example gallery with the Duo first. Then publish. | Both |

Each phase leaves the library working, with the tests and the Duo simulator run at every step.

**Phase 2 status (2026-11-20): done, verified on the Duo simulator.** `SafeAreaView` (bands by default, `granular`,
`dynamic`, modes `padding`/`margin`/`offset`/`none`, `edges` object form, `onInsetsChange`) on one native view,
`GSASafeAreaView`; `useSafeAreaInsetsFor` replaces the manual hook; the props hook and `scrollable` prop are gone. Found
on the way:

- **Tracking by observation works beyond scrolling.** A dynamic view follows a container moved by Animated's native
  driver, in the same frame, with nothing in JS (example: **Moving elements**).
- **Navigation transitions need care.** While a screen transitions (iOS 27 zooms it from the tapped card), the views
  around it are mid-animation and React Native is still laying it out, so static views read wrong positions there. They
  now keep what they have during a view controller transition and measure once it completes, and they start from what
  JS measured from React Native's layout before the first frame, in every mode. Result: no report and no jump on push
  or pop.
- **Pagers** (`pagingEnabled`) are measured where their pages come to rest, not as scrolling content; otherwise every
  page of a tab view would ignore the side column.
- **Cost:** about 1.3 µs per measurement. 300 granular views (150 dynamic) in a fast-scrolled `FlatList` take 1 to 4%
  of the main thread; most of it is static views measuring after each mounting transaction. A shared observer per
  layer and skipping transactions that don't touch a view's ancestors would cut it further if it ever matters.
- Web: the example bundles; not run in a browser this time.

**Phase 2b status (2026-11-20): done, verified on the iPhone 18 Pro and Duo simulators.** Asked for because on regular
iPhones a sheet's bottom inset included the tab bar and the app's floating accessories it covers.

- **Draw order decides.** Every app UI region names the view that draws it (UIKit bars get ids from a window-wide scan;
  accessories and the back button bring their own); each view works out, when it's laid out, which of them are drawn
  on top of it: where their branches meet, which comes later or has the higher `zPosition`. Verified: tab screen content
  under the tab bar, a JS overlay at the root over it, a native sheet over it, each the right way round.
- **Where a view can be seen** (its clipping ancestors) bounds it, and decides whether a whole band counts: one only
  does when something in it that covers the view reaches that area. A Duo sheet below the status cluster gets nothing
  from the column; a full-screen modal does.
- **Results** (bottom inset of an overlay footer over the tab screen with the boarding pass accessory): JS sheet 34,
  form sheet 26 (iOS 27's form sheet floats 8 pt up, so it only overlaps the home indicator by 26), full-screen modal
  34, on both devices; the tab screen's list ends above the accessory, the tab bar and the home indicator.
- **No nested providers.** A view outside any provider measures in the one covering its window. A full-screen modal
  takes the presenting screens out of the window, root provider and all; the view then measures in window coordinates,
  which the root provider shares.
- **Measured as laid out, refined.** Static views leave out the transforms React Native sets (animations) but keep
  UIKit's positioning (sheets float, containers move). Leaving out UIKit's too broke sheets; including React Native's
  made static views follow animations.
- **Transitions.** Measuring from layout during a push still gave transient positions (UIKit moves the screens' own
  frames), so static views keep waiting for pushes to finish. A sheet or modal being presented, though, has its views
  where they'll rest from the start, so they measure straight away and are right before they slide into view. JS's
  first estimate tells accessories underneath from the order of the tree (`compareDocumentPosition`, which React
  Native's elements have); UIKit bars are assumed to cover until the native side knows.
- **Accessories keep their region out of the window** (another tab, under a full-screen modal): they cover nothing
  then anyway, and removing them made the screen's own content flicker on its way back.

## Decisions (defaults chosen, change any)

1. Build on react-native-safe-area-context and re-export it, rather than writing a standalone replacement. This keeps
   React Navigation and Expo Router headers consistent, and reuses years of fixes on Android, web and modals.
2. New Architecture only, RN ≥ 0.82. This gives synchronous `getBoundingClientRect` and no flash on the first frame.
3. Views avoid whole bands by default, which keeps scrolling content clear of the OS UI without moving, as Apple
   recommends. Granular avoidance is opt-in per view (`granular` for fixed UI), and following movement is opt-in
   (`dynamic`), because movement is a design decision.
4. v1 covers iOS and Android natively, plus mocks and web.
5. Zero-config, with a drop-in `SafeAreaView`. Reanimated is optional, through its own entry point.

## Sources

- Apple: [UIView.ReservedRegion](https://developer.apple.com/documentation/uikit/uiview/reservedregion),
  [verticalBarEdge](https://developer.apple.com/documentation/uikit/uitraitcollection/verticalbaredge),
  [UIView.LayoutRegion](https://developer.apple.com/documentation/uikit/uiview/layoutregion),
  [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo),
  [HIG: Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo),
  tech talks [111461](https://developer.apple.com/videos/play/tech-talks/111461/),
  [111462](https://developer.apple.com/videos/play/tech-talks/111462/),
  [111463](https://developer.apple.com/videos/play/tech-talks/111463/)
- [React Native 0.82: DOM Node APIs](https://reactnative.dev/blog/2025/10/08/react-native-0.82)
- [Expo: Supporting iPhone Duo](https://expo.dev/blog/supporting-iphone-duo),
  [RN library status on the Duo](https://iphoneduosupport.com/blog/react-native-libraries-iphone-duo/),
  [Plurigent: Duo safe-area values](https://plurigent.com/tutorials/iphone-duo/safe-area)
