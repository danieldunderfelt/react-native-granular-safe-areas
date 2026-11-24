#import "GSASafeAreaView.h"

#import "GSAOwners.h"
#import "GSAProviderView.h"
#import "GSAWindowObserver.h"

#import <React/RCTMountingTransactionObserving.h>
#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>

#include <vector>

using namespace facebook::react;

static void *GSALayerContext = &GSALayerContext;
static void *GSAScrollContext = &GSAScrollContext;

/// Changes smaller than this are rounding noise from the coordinate conversions, not movement.
static const CGFloat GSAEpsilon = 0.25;

/// Set while React Native mounts a transaction. Views move in bursts then, and every view measures once the
/// transaction has mounted, so a dynamic view only measures straight away when its ancestors move outside of one.
static BOOL GSAMounting = NO;

namespace {
/// A region to avoid, in the provider's coordinates. JS has already applied `avoid` and `spacing`.
struct GSARegion {
  CGRect frame;
  /// The edge the region hugs: 0 for none (a floating region), then 1 top, 2 right, 3 bottom, 4 left.
  int edge;
  /// For a corner region (an iPad window's controls), the other edge it hugs, coded the same way; 0 otherwise.
  int side;
  /// The view that draws it (a bar, an accessory, the vertical bar back button), or 0 for system UI.
  NSInteger owner;
  /// A whole inset band.
  bool band;
  /// Whether it's drawn on top of this view, so it can cover it. System UI always is; app UI only when its view is
  /// drawn on top of this one. Worked out when the view is laid out.
  bool covers;
};

/// Edge bits, as in the `edges` prop.
enum : int { GSATop = 1, GSARight = 2, GSABottom = 4, GSALeft = 8 };
/// Scroll axes.
enum : int { GSAVertical = 1, GSAHorizontal = 2 };
} // namespace

template <typename T>
static std::vector<GSARegion> GSARegionsFrom(const std::vector<T> &source)
{
  std::vector<GSARegion> regions;
  regions.reserve(source.size());
  for (const auto &region : source) {
    regions.push_back({
        CGRectMake(region.x, region.y, region.width, region.height),
        region.edge,
        region.side,
        region.owner,
        region.band,
        region.owner == 0,
    });
  }
  return regions;
}

/// How far each edge of `element` has to move in to clear the regions that cover it and that it overlaps.
/// `computeElementInsets` in geometry.ts; keep the two in step. Regions hugging an edge in `ignored` (a scrolling
/// edge) are skipped.
static UIEdgeInsets GSAInsetsForElement(
    CGRect element,
    CGRect visible,
    const std::vector<GSARegion> &regions,
    int edges,
    int ignored)
{
  UIEdgeInsets out = UIEdgeInsetsZero;
  // Only the part that can be seen counts: an element out of view has no insets, and every inset stays bounded.
  const CGFloat x = MAX(CGRectGetMinX(element), CGRectGetMinX(visible));
  const CGFloat y = MAX(CGRectGetMinY(element), CGRectGetMinY(visible));
  const CGFloat maxX = MIN(CGRectGetMaxX(element), CGRectGetMaxX(visible));
  const CGFloat maxY = MIN(CGRectGetMaxY(element), CGRectGetMaxY(visible));
  if (maxX <= x || maxY <= y) {
    return out;
  }
  for (const auto &region : regions) {
    if (!region.covers || (region.edge != 0 && (ignored & (1 << (region.edge - 1))) != 0)) {
      continue;
    }
    const CGRect f = region.frame;
    if (!(x < CGRectGetMaxX(f) && CGRectGetMinX(f) < maxX && y < CGRectGetMaxY(f) && CGRectGetMinY(f) < maxY)) {
      continue;
    }
    // Top, right, bottom, left.
    const CGFloat need[4] = {
        CGRectGetMaxY(f) - y, maxX - CGRectGetMinX(f), maxY - CGRectGetMinY(f), CGRectGetMaxX(f) - x};
    int edge = region.edge;
    const bool sideAllowed = region.side != 0 && (edges & (1 << (region.side - 1))) != 0 &&
        (ignored & (1 << (region.side - 1))) == 0;
    if (edge != 0 && sideAllowed) {
      // A corner region (an iPad window's controls): away from its edge, below the controls, unless that takes more
      // than half of the element's size along that axis or isn't allowed; then away from its side, past them, the way
      // a toolbar's items move over. `cornerExit` in geometry.ts.
      const CGFloat size = (edge == 1 || edge == 3) ? maxY - y : maxX - x;
      const bool away = (edges & (1 << (edge - 1))) != 0 && need[edge - 1] <= size / 2;
      if (!away) {
        edge = region.side;
      }
    }
    int best = -1;
    for (int i = 0; i < 4; i++) {
      if ((edge != 0 && edge != i + 1) || (edges & (1 << i)) == 0) {
        continue;
      }
      if (best < 0 || need[i] < need[best]) {
        best = i;
      }
    }
    switch (best) {
      case 0:
        out.top = MAX(out.top, need[0]);
        break;
      case 1:
        out.right = MAX(out.right, need[1]);
        break;
      case 2:
        out.bottom = MAX(out.bottom, need[2]);
        break;
      case 3:
        out.left = MAX(out.left, need[3]);
        break;
      default:
        break;
    }
  }
  return out;
}

/// The bands (and other regions) a view that avoids whole bands has to avoid: a band only counts when something in it
/// that covers the view reaches where the view can be seen. `safeAreaViewInsets` in geometry.ts; keep in step.
static std::vector<GSARegion> GSABandsThatCover(
    const std::vector<GSARegion> &bands,
    const std::vector<GSARegion> &regions,
    CGRect visible)
{
  std::vector<GSARegion> covering;
  covering.reserve(bands.size());
  for (const auto &band : bands) {
    if (!band.covers) {
      continue;
    }
    bool reaches = !band.band;
    for (const auto &region : regions) {
      if (reaches) {
        break;
      }
      // Without a breakdown, the band itself is in the list: the system draws it, on top of everything.
      reaches = region.covers && CGRectIntersectsRect(region.frame, visible) &&
          CGRectContainsRect(CGRectInset(band.frame, -0.5, -0.5), region.frame);
    }
    if (reaches) {
      covering.push_back(band);
    }
  }
  return covering;
}

static BOOL GSAInsetsClose(UIEdgeInsets a, UIEdgeInsets b)
{
  return fabs(a.top - b.top) < GSAEpsilon && fabs(a.right - b.right) < GSAEpsilon &&
      fabs(a.bottom - b.bottom) < GSAEpsilon && fabs(a.left - b.left) < GSAEpsilon;
}

/// The axes a scroll view moves its content along. React Native's vertical scroll views always bounce vertically and
/// horizontal ones horizontally, so this holds even while the content fits.
static int GSAScrollAxes(UIScrollView *scrollView)
{
  if (!scrollView.scrollEnabled) {
    return 0;
  }
  const CGSize content = scrollView.contentSize;
  const CGSize size = scrollView.bounds.size;
  int axes = 0;
  if (scrollView.alwaysBounceVertical || content.height > size.height + 0.5) {
    axes |= GSAVertical;
  }
  if (scrollView.alwaysBounceHorizontal || content.width > size.width + 0.5) {
    axes |= GSAHorizontal;
  }
  return axes;
}

/// `rect`, in `view`'s coordinates, in its window's, as laid out: React Native's views where React Native put them,
/// without the transforms React Native gives them (that's how animations move things around for a while), and UIKit's
/// views (containers, sheets, scroll views) wherever UIKit has them.
static CGRect GSALaidOutRectInWindow(CGRect rect, UIView *view)
{
  for (UIView *current = view; current.superview != nil; current = current.superview) {
    if ([current isKindOfClass:RCTViewComponentView.class]) {
      CALayer *layer = current.layer;
      const CGRect bounds = layer.bounds;
      rect.origin.x += layer.position.x - layer.anchorPoint.x * bounds.size.width - bounds.origin.x;
      rect.origin.y += layer.position.y - layer.anchorPoint.y * bounds.size.height - bounds.origin.y;
    } else {
      rect = [current convertRect:rect toView:current.superview];
    }
  }
  return rect;
}

/// Where `rect`, in `view`'s coordinates, is in `space`: as laid out (see `GSALaidOutRectInWindow`), or as drawn right
/// now, transforms included.
static CGRect GSAConvertRect(CGRect rect, UIView *view, UIView *space, BOOL laidOut)
{
  if (!laidOut) {
    return [view convertRect:rect toView:space];
  }
  const CGRect inWindow = GSALaidOutRectInWindow(rect, view);
  const CGPoint spaceOrigin = GSALaidOutRectInWindow(space.bounds, space).origin;
  return CGRectOffset(inWindow, -spaceOrigin.x, -spaceOrigin.y);
}

/// Whether the sheet or modal `view` is in is being presented. Unlike other transitions, a presentation puts its views
/// where they'll rest from the start, and animates them in from there.
static BOOL GSAIsBeingPresented(UIView *view)
{
  UIResponder *responder = view;
  while (responder != nil && ![responder isKindOfClass:UIViewController.class]) {
    responder = responder.nextResponder;
  }
  UIViewController *controller = (UIViewController *)responder;
  while (controller.parentViewController != nil) {
    controller = controller.parentViewController;
  }
  return controller.isBeingPresented;
}

/// Layer properties that move what's inside a view. Scroll views also move their content through `contentOffset`,
/// which is observed on the view instead of their layer's `bounds`.
static NSArray<NSString *> *GSAObservedLayerKeys(BOOL scrollView)
{
  return scrollView ? @[ @"position", @"transform" ] : @[ @"position", @"bounds", @"transform" ];
}

@interface GSASafeAreaView () <RCTMountingTransactionObserving>
@end

@implementation GSASafeAreaView {
  std::vector<GSARegion> _regions;
  std::vector<GSARegion> _bands;
  int _edges;
  BOOL _granular;
  BOOL _dynamic;
  BOOL _applyOffset;
  BOOL _reportInsets;
  BOOL _underlying;
  UIEdgeInsets _margins;
  /// `SafeAreaAccessory`: the id this view registers under as a region owner, and where it last said it's drawn.
  NSInteger _ownerId;
  CGRect _reportedAccessoryFrame;
  BOOL _accessoryShown;

  /// The provider the regions are measured in: the nearest `GSAProviderView` above this view, or the one covering
  /// its window (for content in a sheet or a modal).
  __weak GSAProviderView *_provider;
  /// Dynamic views: the views between this one and the provider, whose geometry is observed. Held, so they can always
  /// be unobserved; released when this view leaves the window, which it does whenever they do.
  NSArray<UIView *> *_observed;

  /// Offset mode: the translation applied, the layer transform it was applied on top of, and the result.
  CGPoint _offset;
  CATransform3D _baseTransform;
  CATransform3D _appliedTransform;
  /// The insets last sent to JS.
  UIEdgeInsets _reportedInsets;
  BOOL _reported;
  /// Whether the view has measured itself yet. Until it has, it uses what JS measured from React Native's layout.
  BOOL _measured;
  /// The transition a static view is waiting for.
  __weak id<UIViewControllerTransitionCoordinator> _awaitedTransition;
  /// Whether the view has been in a window before, so coming back to one is told apart from mounting.
  BOOL _wasInWindow;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GranularSafeAreaViewComponentDescriptor>();
}

// A recycled view would carry its translation and its observers into its next use.
+ (BOOL)shouldBeRecycled
{
  return NO;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GranularSafeAreaViewProps>();
    _props = defaultProps;
    _edges = GSATop | GSARight | GSABottom | GSALeft;
    _baseTransform = CATransform3DIdentity;
    _appliedTransform = CATransform3DIdentity;
  }
  return self;
}

- (void)dealloc
{
  [self stopObserving];
  GSAUnregisterOwner(_ownerId, self);
}

#pragma mark - React Native

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<const GranularSafeAreaViewProps>(props);
  _regions = GSARegionsFrom(newProps.regions);
  _bands = GSARegionsFrom(newProps.bands);
  _edges = newProps.edges;
  _granular = newProps.granular;
  _underlying = newProps.underlying;
  if (newProps.ownerId != _ownerId) {
    GSAUnregisterOwner(_ownerId, self);
    _ownerId = newProps.ownerId;
    GSARegisterOwner(_ownerId, self);
    _accessoryShown = NO;
  }
  _margins = UIEdgeInsetsMake(newProps.margins.top, newProps.margins.left, newProps.margins.bottom, newProps.margins.right);
  if (newProps.reportInsets != _reportInsets) {
    _reportInsets = newProps.reportInsets;
    _reported = _reported && !_measured;
  }
  _applyOffset = newProps.applyOffset;
  CGPoint offset = _offset;
  if (!_measured) {
    // Start from what JS measured from React Native's layout, so the first frame is right even before this view can
    // measure itself (in a screen that is still transitioning in).
    const auto &initial = newProps.initialInsets;
    const UIEdgeInsets insets = UIEdgeInsetsMake(initial.top, initial.left, initial.bottom, initial.right);
    offset = CGPointMake(insets.left - insets.right, insets.top - insets.bottom);
    _reportedInsets = insets;
    _reported = YES;
  }
  if (newProps.dynamic != _dynamic) {
    _dynamic = newProps.dynamic;
    if (!_dynamic) {
      [self stopObserving];
    }
  }

  [super updateProps:props oldProps:oldProps];
  // A new `transform` prop (or Animated) replaced the layer's transform: put the translation back on top of it, or
  // take it off when the view no longer applies one. Everything else is measured once the transaction has mounted,
  // when every ancestor is in its new place.
  [self applyOffset:_applyOffset ? offset : CGPointZero];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  // React Native re-resolves a `transform` prop when the size changes.
  [self applyOffset:_offset];
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];
  // A new emitter hasn't been told anything yet, unless it's the first: JS started from the same insets.
  if (_measured) {
    _reported = NO;
  }
}

- (void)mountingTransactionWillMount:(const MountingTransaction &)transaction
                withSurfaceTelemetry:(const SurfaceTelemetry &)surfaceTelemetry
{
  GSAMounting = YES;
}

/// Called after every mounting transaction in the surface. Any of them can move this view without touching it: an
/// ancestor resized or moved, items inserted above it, new regions.
- (void)mountingTransactionDidMount:(const MountingTransaction &)transaction
               withSurfaceTelemetry:(const SurfaceTelemetry &)surfaceTelemetry
{
  GSAMounting = NO;
  [self refresh];
}

#pragma mark - Change sources

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    if (_wasInWindow) {
      // Coming back (a full-screen modal dismissed, a screen popped back to, a tab selected again) can bring back bars
      // that left the window with it, and nothing else reports those. The views coming back together share one scan.
      // Mounting needs none of this: JS asks for a scan when views mount.
      [[GSAProviderView providerForView:self] refresh];
      [[GSAWindowObserver shared] refresh];
    }
    _wasInWindow = YES;
    [self refresh];
  } else {
    [self stopObserving];
    _provider = nil;
    // An accessory out of the window (in a screen navigated away from, another tab, under a full-screen modal) keeps
    // its region: it covers nothing while it's out, because every view checks that it's drawn on top of it, and it's
    // right as soon as it's back.
  }
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context
{
  if (context == GSALayerContext || context == GSAScrollContext) {
    // Synchronous, so the view is in its new place in the same frame. During a mounting transaction, the measurement
    // at its end covers it.
    if (!GSAMounting) {
      [self measure];
    }
  } else {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
  }
}

#pragma mark - Measuring

/// Finds the provider, works out which app UI is drawn on top of this view, and for a dynamic view observes everything
/// between it and the provider. Then measures. A walk up the superview chain, cheap enough for every transaction.
- (void)refresh
{
  if (self.window == nil) {
    return;
  }
  GSAProviderView *provider = [GSAProviderView providerForView:self];
  _provider = provider;
  [self updateCovers:_regions];
  [self updateCovers:_bands];
  if (_dynamic) {
    // Views above the provider move it along with this one, so they change nothing.
    NSMutableArray<UIView *> *chain = [NSMutableArray new];
    for (UIView *view = self.superview; view != nil && view != provider && provider != nil; view = view.superview) {
      [chain addObject:view];
    }
    [self observe:chain];
  }
  [self measure];
}

/// Which regions can cover this view: system UI always; app UI when its view is drawn on top of this one (a sheet
/// isn't covered by the tab bar of the screen beneath it), or, with `underlying`, whenever it's drawn at all.
- (void)updateCovers:(std::vector<GSARegion> &)regions
{
  for (auto &region : regions) {
    if (region.owner == 0) {
      region.covers = true;
      continue;
    }
    UIView *owner = GSAOwnerView(region.owner);
    region.covers = owner != nil &&
        (_underlying ? owner.window == self.window && !GSAAreRelated(owner, self) : GSAIsDrawnAbove(owner, self));
  }
}

/// Measures where the view is in the provider and applies the insets it needs there.
- (void)measure
{
  UIView *superview = self.superview;
  UIWindow *window = self.window;
  if (superview == nil || window == nil) {
    return;
  }
  // The regions are in the provider's coordinates. A full-screen modal takes the presenting screens out of the window,
  // provider and all; the root provider fills the window, so the window's coordinates are the same.
  GSAProviderView *provider = _provider;
  UIView *space = provider.window == window ? provider : window;
  // A static view is measured as laid out, so where an animation has it for the moment doesn't count. A dynamic view
  // follows what's on screen.
  const BOOL laidOut = !_dynamic;
  // While a screen transitions, things are only where they'll be once it's done, so a static view keeps what it has
  // (on mount, what JS measured from React Native's layout) and measures when it's over. A sheet or modal being
  // presented is the exception: its views are where they'll rest from the start, so it measures straight away, while
  // the sheet is still sliding in.
  if (!_dynamic) {
    id<UIViewControllerTransitionCoordinator> transition = GSATransitionCoordinator(self);
    if (transition != nil) {
      [self waitForTransition:transition];
      if (!GSAIsBeingPresented(self)) {
        return;
      }
    }
  }
  // As laid out: without the view's own transform, so animating it never feeds back into its insets, and without the
  // margin JS gave it.
  CALayer *layer = self.layer;
  const CGSize size = layer.bounds.size;
  const CGPoint position = layer.position;
  const CGPoint anchor = layer.anchorPoint;
  const CGRect frame = CGRectMake(
      position.x - anchor.x * size.width - _margins.left,
      position.y - anchor.y * size.height - _margins.top,
      size.width + _margins.left + _margins.right,
      size.height + _margins.top + _margins.bottom);
  CGRect rect = GSAConvertRect(frame, superview, space, laidOut);

  // One walk up to the provider: where the view can be seen (inside every clipping ancestor: a scroll view, a sheet,
  // `overflow: hidden`), and the scroll views around it.
  //
  // A static view's position along a scroll axis isn't fixed, and neither is that of a clip that scrolls along with it
  // (a list row, a rounded card). Such a clip is stretched along the axis, so only the scroll view's own bounds count
  // there: otherwise a row would only avoid what's beside wherever it was last laid out. In a pager, the view and the
  // clips that page with it are measured where the page comes to rest. A dynamic view follows what's on screen, so it
  // takes every clip where it is right now.
  const CGRect spaceBounds = space.bounds;
  CGRect clip = CGRectNull;
  BOOL clipped = NO;
  int axes = 0;
  for (UIView *view = superview; view != nil && view != space; view = view.superview) {
    if ([view isKindOfClass:UIScrollView.class]) {
      UIScrollView *scrollView = (UIScrollView *)view;
      const int scrollAxes = GSAScrollAxes(scrollView);
      if (scrollAxes != 0 && scrollView.pagingEnabled) {
        // A pager's content comes to rest on a page, so it's measured where it will rest, like content that doesn't
        // scroll. A dynamic view follows it as it moves instead.
        if (!_dynamic) {
          const CGPoint shift = [self restingShiftInPager:scrollView
                                                     axes:scrollAxes
                                              pagerOffset:GSAConvertRect(frame, superview, scrollView, YES)];
          rect = CGRectOffset(rect, shift.x, shift.y);
          if (clipped && !CGRectIsNull(clip)) {
            clip = CGRectOffset(clip, shift.x, shift.y);
          }
        }
      } else if (scrollAxes != 0) {
        axes |= scrollAxes;
        if (!_dynamic && clipped && !CGRectIsNull(clip)) {
          if ((scrollAxes & GSAVertical) != 0) {
            clip.origin.y = CGRectGetMinY(spaceBounds);
            clip.size.height = CGRectGetHeight(spaceBounds);
          }
          if ((scrollAxes & GSAHorizontal) != 0) {
            clip.origin.x = CGRectGetMinX(spaceBounds);
            clip.size.width = CGRectGetWidth(spaceBounds);
          }
        }
      }
    }
    if (view.clipsToBounds || view.layer.masksToBounds) {
      const CGRect bounds = GSAConvertRect(view.bounds, view, space, laidOut);
      clip = clipped ? CGRectIntersection(clip, bounds) : bounds;
      clipped = YES;
    }
  }
  const CGRect visible = clipped ? CGRectIntersection(spaceBounds, clip) : spaceBounds;

  // A position along a scroll axis isn't fixed, so a view that doesn't follow it has to avoid whole bands, measured
  // as if it covered all of the scroll view it can be seen in. Regions on the edges it scrolls towards are the scroll
  // view's content inset's.
  const BOOL useRegions = _dynamic || (_granular && axes == 0);
  int ignored = 0;
  if ((axes & GSAVertical) != 0) {
    ignored |= GSATop | GSABottom;
    if (!_dynamic) {
      rect.origin.y = CGRectGetMinY(visible);
      rect.size.height = CGRectGetHeight(visible);
    }
  }
  if ((axes & GSAHorizontal) != 0) {
    ignored |= GSALeft | GSARight;
    if (!_dynamic) {
      rect.origin.x = CGRectGetMinX(visible);
      rect.size.width = CGRectGetWidth(visible);
    }
  }
  // A static view entirely out of view (a screen navigation moved away) keeps what it has: it isn't laid out there.
  if (!_dynamic && CGRectIsEmpty(CGRectIntersection(rect, visible))) {
    return;
  }
  _measured = YES;
  [self applyInsets:GSAInsetsForElement(
                        rect,
                        visible,
                        useRegions ? _regions : GSABandsThatCover(_bands, _regions, visible),
                        _edges,
                        ignored)];
  if (_ownerId != 0) {
    // Where it's drawn, with its own offset: that's what covers the content beneath it.
    [self reportAccessoryFrame:[self convertRect:self.bounds toView:space]];
  }
}

/// `SafeAreaAccessory`: tells JS where the view is drawn, for the region it takes, or `CGRectNull` when it isn't.
- (void)reportAccessoryFrame:(CGRect)frame
{
  if (_ownerId == 0 || _eventEmitter == nullptr) {
    return;
  }
  const BOOL shown = !CGRectIsNull(frame);
  if (shown == _accessoryShown &&
      (!shown ||
       (fabs(frame.origin.x - _reportedAccessoryFrame.origin.x) < GSAEpsilon &&
        fabs(frame.origin.y - _reportedAccessoryFrame.origin.y) < GSAEpsilon &&
        fabs(frame.size.width - _reportedAccessoryFrame.size.width) < GSAEpsilon &&
        fabs(frame.size.height - _reportedAccessoryFrame.size.height) < GSAEpsilon))) {
    return;
  }
  _accessoryShown = shown;
  _reportedAccessoryFrame = shown ? frame : CGRectZero;
  std::static_pointer_cast<const GranularSafeAreaViewEventEmitter>(_eventEmitter)
      ->onAccessoryChange({
          .visible = (bool)shown,
          .x = shown ? frame.origin.x : 0,
          .y = shown ? frame.origin.y : 0,
          .width = shown ? frame.size.width : 0,
          .height = shown ? frame.size.height : 0,
      });
}

- (void)waitForTransition:(id<UIViewControllerTransitionCoordinator>)transition
{
  if (transition == _awaitedTransition) {
    return;
  }
  _awaitedTransition = transition;
  __weak __typeof(self) weakSelf = self;
  BOOL waiting = [transition animateAlongsideTransition:nil
                                             completion:^(id<UIViewControllerTransitionCoordinatorContext> context) {
                                               __typeof(self) strongSelf = weakSelf;
                                               if (strongSelf != nil) {
                                                 strongSelf->_awaitedTransition = nil;
                                                 [strongSelf refresh];
                                               }
                                             }];
  if (!waiting) {
    // Not animated: it's over by the next turn of the run loop.
    _awaitedTransition = nil;
    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf refresh];
    });
  }
}

/// How far the view moves once `pager` comes to rest on the page that holds the view's center. `inPager` is the view's
/// frame in the pager's content.
- (CGPoint)restingShiftInPager:(UIScrollView *)pager axes:(int)axes pagerOffset:(CGRect)inPager
{
  const CGSize page = pager.bounds.size;
  const CGPoint offset = pager.contentOffset;
  CGPoint shift = CGPointZero;
  if ((axes & GSAHorizontal) != 0 && page.width > 0) {
    shift.x = offset.x - floor(CGRectGetMidX(inPager) / page.width) * page.width;
  }
  if ((axes & GSAVertical) != 0 && page.height > 0) {
    shift.y = offset.y - floor(CGRectGetMidY(inPager) / page.height) * page.height;
  }
  return shift;
}

- (void)applyInsets:(UIEdgeInsets)insets
{
  [self applyOffset:_applyOffset ? CGPointMake(insets.left - insets.right, insets.top - insets.bottom) : CGPointZero];
  if (_reportInsets) {
    [self reportInsets:insets];
  }
}

/// Translates the view by `offset` on top of the transform React Native gave it. The translation comes last, so it is
/// in the parent's units even when the view scales or rotates.
- (void)applyOffset:(CGPoint)offset
{
  CATransform3D current = self.layer.transform;
  const BOOL ours = CATransform3DEqualToTransform(current, _appliedTransform);
  if (ours && fabs(offset.x - _offset.x) < GSAEpsilon && fabs(offset.y - _offset.y) < GSAEpsilon) {
    return;
  }
  if (!ours) {
    // A new `transform` prop or Animated set the layer's transform since: that's the base now.
    _baseTransform = current;
  }
  CATransform3D next = offset.x == 0 && offset.y == 0
      ? _baseTransform
      : CATransform3DConcat(_baseTransform, CATransform3DMakeTranslation(offset.x, offset.y, 0));
  _offset = offset;
  _appliedTransform = next;
  if (!CATransform3DEqualToTransform(current, next)) {
    self.layer.transform = next;
  }
}

/// Padding and margin change layout, which only React Native can do, so JS applies them.
- (void)reportInsets:(UIEdgeInsets)insets
{
  if (_eventEmitter == nullptr || (_reported && GSAInsetsClose(insets, _reportedInsets))) {
    return;
  }
  _reported = YES;
  _reportedInsets = insets;
  std::static_pointer_cast<const GranularSafeAreaViewEventEmitter>(_eventEmitter)
      ->onInsetsChange({
          .top = insets.top,
          .right = insets.right,
          .bottom = insets.bottom,
          .left = insets.left,
      });
}

#pragma mark - Observing (dynamic views)

- (void)observe:(NSArray<UIView *> *)chain
{
  if ([chain isEqualToArray:_observed ?: @[]]) {
    return;
  }
  [self stopObserving];
  for (UIView *view in chain) {
    const BOOL scrollView = [view isKindOfClass:UIScrollView.class];
    for (NSString *key in GSAObservedLayerKeys(scrollView)) {
      [view.layer addObserver:self forKeyPath:key options:0 context:GSALayerContext];
    }
    if (scrollView) {
      [view addObserver:self forKeyPath:@"contentOffset" options:0 context:GSAScrollContext];
    }
  }
  _observed = [chain copy];
}

- (void)stopObserving
{
  for (UIView *view in _observed) {
    const BOOL scrollView = [view isKindOfClass:UIScrollView.class];
    for (NSString *key in GSAObservedLayerKeys(scrollView)) {
      [view.layer removeObserver:self forKeyPath:key context:GSALayerContext];
    }
    if (scrollView) {
      [view removeObserver:self forKeyPath:@"contentOffset" context:GSAScrollContext];
    }
  }
  _observed = nil;
}

@end
