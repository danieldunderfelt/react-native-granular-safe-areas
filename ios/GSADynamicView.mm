#import "GSADynamicView.h"

#import "GSAProviderView.h"

#import <React/RCTMountingTransactionObserving.h>
#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>

#include <vector>

using namespace facebook::react;

static void *GSAScrollContext = &GSAScrollContext;

/// Changes smaller than this are rounding noise from the coordinate conversions, not movement.
static const CGFloat GSAEpsilon = 0.25;

namespace {
/// A region to avoid, in the provider's coordinates. JS has already applied `avoid`, `spacing` and `scrollable`.
struct GSARegion {
  CGRect frame;
  /// The edge the region hugs: 0 for none (a floating region), then 1 top, 2 right, 3 bottom, 4 left.
  int edge;
};
} // namespace

/// How far each edge of `element` has to move in to clear the regions it overlaps. This is `computeElementInsets` in
/// geometry.ts; keep the two in step. `edges` holds the allowed edges as bits: 1 top, 2 right, 4 bottom, 8 left.
static UIEdgeInsets GSAInsetsForElement(CGRect element, CGSize bounds, const std::vector<GSARegion> &regions, int edges)
{
  UIEdgeInsets out = UIEdgeInsetsZero;
  // Only the on-screen part counts: an element scrolled out of view has no insets, and every inset stays bounded.
  const CGFloat x = MAX(CGRectGetMinX(element), 0);
  const CGFloat y = MAX(CGRectGetMinY(element), 0);
  const CGFloat maxX = MIN(CGRectGetMaxX(element), bounds.width);
  const CGFloat maxY = MIN(CGRectGetMaxY(element), bounds.height);
  if (maxX <= x || maxY <= y) {
    return out;
  }
  for (const auto &region : regions) {
    const CGRect f = region.frame;
    if (!(x < CGRectGetMaxX(f) && CGRectGetMinX(f) < maxX && y < CGRectGetMaxY(f) && CGRectGetMinY(f) < maxY)) {
      continue;
    }
    // Top, right, bottom, left.
    const CGFloat need[4] = {
        CGRectGetMaxY(f) - y, maxX - CGRectGetMinX(f), maxY - CGRectGetMinY(f), CGRectGetMaxX(f) - x};
    int best = -1;
    for (int i = 0; i < 4; i++) {
      if ((region.edge != 0 && region.edge != i + 1) || (edges & (1 << i)) == 0) {
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

static BOOL GSAInsetsClose(UIEdgeInsets a, UIEdgeInsets b)
{
  return fabs(a.top - b.top) < GSAEpsilon && fabs(a.right - b.right) < GSAEpsilon &&
      fabs(a.bottom - b.bottom) < GSAEpsilon && fabs(a.left - b.left) < GSAEpsilon;
}

@interface GSADynamicView () <RCTMountingTransactionObserving>
@end

@implementation GSADynamicView {
  std::vector<GSARegion> _regions;
  int _edges;
  BOOL _padding;
  /// The provider the regions are measured in: the nearest `GSAProviderView` above this view.
  __weak GSAProviderView *_provider;
  /// The scroll views between this view and the provider. Held, so they can always be unobserved; released when this
  /// view leaves the window, which it does whenever they do.
  NSArray<UIScrollView *> *_scrollViews;
  /// Offset mode: the translation this view applies, the layer transform it was applied on top of, and the result.
  CGPoint _offset;
  CATransform3D _baseTransform;
  CATransform3D _appliedTransform;
  /// Padding mode: the insets last sent to JS.
  UIEdgeInsets _reportedInsets;
  BOOL _reported;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GranularSafeAreaDynamicViewComponentDescriptor>();
}

// A recycled view would carry its translation and its observers into its next use. There are few of these views.
+ (BOOL)shouldBeRecycled
{
  return NO;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GranularSafeAreaDynamicViewProps>();
    _props = defaultProps;
    _edges = 0b1111;
    _baseTransform = CATransform3DIdentity;
    _appliedTransform = CATransform3DIdentity;
  }
  return self;
}

- (void)dealloc
{
  [self stopObservingScrollViews];
}

#pragma mark - React Native

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<const GranularSafeAreaDynamicViewProps>(props);
  _regions.clear();
  _regions.reserve(newProps.regions.size());
  for (const auto &region : newProps.regions) {
    _regions.push_back({CGRectMake(region.x, region.y, region.width, region.height), region.edge});
  }
  _edges = newProps.edges;
  BOOL padding = newProps.mode == GranularSafeAreaDynamicViewMode::Padding;
  if (padding != _padding) {
    _padding = padding;
    _reported = NO;
  }

  [super updateProps:props oldProps:oldProps];
  // A new `transform` prop (or Animated) replaced the layer's transform: put the translation back on top of it, or
  // take it off in padding mode. The new regions are applied once the transaction has mounted, when every ancestor is
  // in its new place.
  [self applyOffset:_padding ? CGPointZero : _offset];
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
  // A new emitter hasn't been told anything yet.
  _reported = NO;
}

/// Called after every mounting transaction in the surface. Any of them can move this view without touching it: an
/// ancestor resized or moved, items inserted above it, a scroll view's content changed.
- (void)mountingTransactionDidMount:(const MountingTransaction &)transaction
               withSurfaceTelemetry:(const SurfaceTelemetry &)surfaceTelemetry
{
  [self track];
}

#pragma mark - Change sources

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [self track];
  } else {
    [self stopObservingScrollViews];
    _provider = nil;
  }
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context
{
  if (context == GSAScrollContext) {
    // Synchronous: the new position is applied in the same frame as the scroll.
    [self update];
  } else {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
  }
}

#pragma mark - Tracking

/// Finds the provider and the scroll views in between, then updates. Cheap enough to run on every transaction: one
/// walk up the superview chain.
- (void)track
{
  if (self.window == nil) {
    return;
  }
  GSAProviderView *provider = nil;
  NSMutableArray<UIScrollView *> *scrollViews = [NSMutableArray new];
  for (UIView *view = self.superview; view != nil; view = view.superview) {
    if ([view isKindOfClass:GSAProviderView.class]) {
      provider = (GSAProviderView *)view;
      break;
    }
    if ([view isKindOfClass:UIScrollView.class]) {
      [scrollViews addObject:(UIScrollView *)view];
    }
  }
  _provider = provider;
  // Scroll views above the provider move it along with this view, so they don't change anything.
  [self observeScrollViews:provider != nil ? scrollViews : @[]];
  [self update];
}

- (void)observeScrollViews:(NSArray<UIScrollView *> *)scrollViews
{
  if ([scrollViews isEqualToArray:_scrollViews ?: @[]]) {
    return;
  }
  [self stopObservingScrollViews];
  for (UIScrollView *scrollView in scrollViews) {
    [scrollView addObserver:self forKeyPath:@"contentOffset" options:0 context:GSAScrollContext];
  }
  _scrollViews = [scrollViews copy];
}

- (void)stopObservingScrollViews
{
  for (UIScrollView *scrollView in _scrollViews) {
    [scrollView removeObserver:self forKeyPath:@"contentOffset" context:GSAScrollContext];
  }
  _scrollViews = nil;
}

/// Measures where the view is in the provider and applies the insets it needs there.
- (void)update
{
  GSAProviderView *provider = _provider;
  UIView *superview = self.superview;
  if (provider == nil || superview == nil || self.window == nil) {
    // No provider to measure in (a modal without its own provider): leave the view where it is.
    [self applyInsets:UIEdgeInsetsZero];
    return;
  }
  // Measured without this view's own translation, so applying a result never feeds back into the next one.
  CGPoint applied = [self offsetOnLayer];
  CGRect frame = CGRectOffset([self convertRect:self.bounds toView:superview], -applied.x, -applied.y);
  CGRect rect = [superview convertRect:frame toView:provider];
  [self applyInsets:GSAInsetsForElement(rect, provider.bounds.size, _regions, _edges)];
}

- (void)applyInsets:(UIEdgeInsets)insets
{
  if (_padding) {
    [self reportInsets:insets];
  } else {
    [self applyOffset:CGPointMake(insets.left - insets.right, insets.top - insets.bottom)];
  }
}

/// The translation currently on the layer: none if something replaced the transform since it was applied.
- (CGPoint)offsetOnLayer
{
  return CATransform3DEqualToTransform(self.layer.transform, _appliedTransform) ? _offset : CGPointZero;
}

/// Translates the view by `offset` on top of the transform React Native gave it. The translation comes last, so it is
/// in the parent's units even when the view scales or rotates, like `mode="offset"` in JS.
- (void)applyOffset:(CGPoint)offset
{
  CATransform3D current = self.layer.transform;
  BOOL ours = CATransform3DEqualToTransform(current, _appliedTransform);
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

/// Padding mode: padding changes layout, which only React Native can do, so JS applies it.
- (void)reportInsets:(UIEdgeInsets)insets
{
  if (_eventEmitter == nullptr || (_reported && GSAInsetsClose(insets, _reportedInsets))) {
    return;
  }
  _reported = YES;
  _reportedInsets = insets;
  std::static_pointer_cast<const GranularSafeAreaDynamicViewEventEmitter>(_eventEmitter)
      ->onInsetsChange({
          .top = insets.top,
          .right = insets.right,
          .bottom = insets.bottom,
          .left = insets.left,
      });
}

@end
