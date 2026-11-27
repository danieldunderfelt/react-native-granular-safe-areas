#import "GSAAnchorView.h"

#import "GSAGlassButton.h"
#import "GSAOwners.h"
#import "GSAProviderView.h"

#import <React/RCTConversions.h>
#import <React/RCTMountingTransactionObserving.h>
#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>
#import <react/renderer/components/GranularSafeAreasSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

static void *GSAAnchorLayerContext = &GSAAnchorLayerContext;
static void *GSAAnchorScrollContext = &GSAAnchorScrollContext;

/// Layer properties that can move, transform, clip, or hide an ancestor of the anchor.
static NSArray<NSString *> *GSAAnchorObservedLayerKeys(BOOL scrollView)
{
  return scrollView ? @[ @"position", @"transform", @"hidden", @"opacity" ]
                    : @[ @"position", @"bounds", @"transform", @"hidden", @"opacity" ];
}

@interface GSAAnchorView () <RCTGranularSafeAreaAnchorViewProtocol, RCTMountingTransactionObserving>
@end

/// Whether the screen `anchor` is in is showing: in a window, neither hidden nor fully transparent through any of its
/// ancestors (`opacity: 0`, `display: 'none'`), and drawn inside the window and any clipping ancestors (so a screen
/// slid off screen with `translateY` or collapsed with `scale: 0` stops owning the system back button). During a UIKit
/// transition the screen still counts as showing and is re-checked once the transition ends.
static BOOL GSAIsShowing(UIView *anchor)
{
  UIWindow *window = anchor.window;
  if (window == nil || anchor.hidden) {
    return NO;
  }
  for (UIView *view = anchor.superview; view != nil; view = view.superview) {
    if (view.hidden || view.layer.hidden || view.layer.opacity < 0.01) {
      return NO;
    }
  }
  if (GSATransitionCoordinator(anchor) != nil) {
    return YES;
  }
  if (!CGRectIsEmpty(anchor.bounds) && !CGRectIsEmpty(window.bounds)) {
    const CGRect inWindow = [anchor convertRect:anchor.bounds toView:window];
    if (!CGRectIntersectsRect(inWindow, window.bounds)) {
      return NO;
    }
    for (UIView *view = anchor.superview; view != nil && view != window; view = view.superview) {
      if (view.clipsToBounds || view.layer.masksToBounds) {
        const CGRect clip = [view convertRect:view.bounds toView:window];
        if (!CGRectIntersectsRect(inWindow, clip)) {
          return NO;
        }
      }
    }
  }
  return YES;
}

@implementation GSAAnchorView {
  /// What JS currently believes. JS assumes "showing" until told otherwise, so the first frame is already right.
  BOOL _reportedInWindow;
  BOOL _checkScheduled;
  /// Ancestor views between this anchor and its window whose transform, bounds, opacity, or visibility are observed so
  /// UI-thread animations (Reanimated, Animated native driver, scrolling) update ownership without a React render.
  NSArray<UIView *> *_observed;

  /// The screen's system back button, shown in the screen's root view so it moves and leaves with the screen.
  UIButton *_Nullable _button;
  BOOL _buttonShown;
  CGRect _buttonFrame;
  NSString *_systemImage;
  NSString *_Nullable _label;
  NSInteger _ownerId;
  /// The transition the button waits for to be placed exactly.
  __weak id<UIViewControllerTransitionCoordinator> _awaitedTransition;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GranularSafeAreaAnchorComponentDescriptor>();
}

// A recycled anchor would carry its button into another screen.
+ (BOOL)shouldBeRecycled
{
  return NO;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GranularSafeAreaAnchorProps>();
    _props = defaultProps;
    _reportedInWindow = YES;
    _systemImage = @"chevron.backward";
    self.userInteractionEnabled = NO;
  }
  return self;
}

- (void)dealloc
{
  [self stopObserving];
  GSAUnregisterOwner(_ownerId, _button);
  [_button removeFromSuperview];
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &button = std::static_pointer_cast<const GranularSafeAreaAnchorProps>(props)->button;
  _buttonShown = button.shown;
  _buttonFrame = CGRectMake(button.x, button.y, button.width, button.height);
  _systemImage = RCTNSStringFromStringNilIfEmpty(button.systemImage) ?: @"chevron.backward";
  _label = RCTNSStringFromStringNilIfEmpty(button.label);
  if (button.ownerId != _ownerId) {
    GSAUnregisterOwner(_ownerId, _button);
    _ownerId = button.ownerId;
  }
  if (_button != nil) {
    GSAConfigureGlassButton(_button, _systemImage, _label);
  }
  [super updateProps:props oldProps:oldProps];
  [self layoutButton];
}

#pragma mark - Being shown

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [self updateObservedAncestors];
  } else {
    [self stopObserving];
  }
  [self reportIfChanged];
  [self layoutButton];
}

- (void)didMoveToSuperview
{
  [super didMoveToSuperview];
  // Mounted into a screen that isn't in a window, e.g. a tab that was never selected: UIKit doesn't call
  // -didMoveToWindow then, because the window didn't change. Check once things have settled.
  [self scheduleCheck];
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];
  [self scheduleCheck];
}

- (void)mountingTransactionDidMount:(const MountingTransaction &)transaction
               withSurfaceTelemetry:(const SurfaceTelemetry &)surfaceTelemetry
{
  // Any transaction can hide, translate, clip, or reparent the screen without moving the anchor itself.
  if (self.window != nil) {
    [self updateObservedAncestors];
  }
  [self reportIfChanged];
  [self layoutButton];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context
{
  if (context == GSAAnchorLayerContext || context == GSAAnchorScrollContext) {
    if (GSAIsShowing(self) != _reportedInWindow) {
      [self scheduleCheck];
    }
  } else {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
  }
}

- (void)updateObservedAncestors
{
  UIWindow *window = self.window;
  if (window == nil) {
    [self stopObserving];
    return;
  }
  NSMutableArray<UIView *> *chain = [NSMutableArray new];
  for (UIView *view = self.superview; view != nil && view != window; view = view.superview) {
    [chain addObject:view];
  }
  if ([chain isEqualToArray:_observed ?: @[]]) {
    return;
  }
  [self stopObserving];
  for (UIView *view in chain) {
    const BOOL scrollView = [view isKindOfClass:UIScrollView.class];
    for (NSString *key in GSAAnchorObservedLayerKeys(scrollView)) {
      [view.layer addObserver:self forKeyPath:key options:0 context:GSAAnchorLayerContext];
    }
    if (scrollView) {
      [view addObserver:self forKeyPath:@"contentOffset" options:0 context:GSAAnchorScrollContext];
    }
  }
  _observed = [chain copy];
}

- (void)stopObserving
{
  for (UIView *view in _observed) {
    const BOOL scrollView = [view isKindOfClass:UIScrollView.class];
    for (NSString *key in GSAAnchorObservedLayerKeys(scrollView)) {
      [view.layer removeObserver:self forKeyPath:key context:GSAAnchorLayerContext];
    }
    if (scrollView) {
      [view removeObserver:self forKeyPath:@"contentOffset" context:GSAAnchorScrollContext];
    }
  }
  _observed = nil;
}

- (void)scheduleCheck
{
  if (_checkScheduled) {
    return;
  }
  _checkScheduled = YES;
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof(self) strongSelf = weakSelf;
    if (strongSelf != nil) {
      strongSelf->_checkScheduled = NO;
      [strongSelf reportIfChanged];
    }
  });
}

- (void)reportIfChanged
{
  id<UIViewControllerTransitionCoordinator> transition =
      self.window != nil ? GSATransitionCoordinator(self) : nil;
  if (transition != nil) {
    [self placeAfterTransition:transition];
  }
  BOOL inWindow = GSAIsShowing(self);
  if (inWindow == _reportedInWindow || _eventEmitter == nullptr) {
    return;
  }
  _reportedInWindow = inWindow;
  std::static_pointer_cast<const GranularSafeAreaAnchorEventEmitter>(_eventEmitter)
      ->onWindowChange({.inWindow = (bool)inWindow});
}

#pragma mark - The back button

/// Puts the button in the screen's root view at its slot, or takes it out. Its frame is in the provider's coordinates
/// (the window's without one); in the screen, it's where the screen is at rest. During a transition, the screen is
/// taken to be at rest where it fills the window, which a screen without a navigation bar does, and the button is
/// placed exactly once the transition is over.
- (void)layoutButton
{
  UIWindow *window = self.window;
  UIView *screen = window != nil ? (GSAScreenView(self) ?: window) : nil;
  if (!_buttonShown || screen == nil) {
    GSAUnregisterOwner(_ownerId, _button);
    [_button removeFromSuperview];
    return;
  }
  if (_button == nil) {
    __weak __typeof(self) weakSelf = self;
    _button = GSAMakeGlassButton(^{
      [weakSelf emitPress];
    });
    GSAConfigureGlassButton(_button, _systemImage, _label);
  }

  GSAProviderView *provider = [GSAProviderView providerForView:self];
  UIView *space = provider.window == window ? provider : window;
  const CGRect inWindow = [space convertRect:_buttonFrame toView:nil];
  id<UIViewControllerTransitionCoordinator> transition = GSATransitionCoordinator(self);
  CGRect frame;
  if (transition != nil) {
    frame = inWindow;
    [self placeAfterTransition:transition];
  } else {
    frame = [screen convertRect:inWindow fromView:nil];
  }

  const BOOL appearing = _button.superview != screen;
  if (appearing) {
    [_button removeFromSuperview];
    [screen addSubview:_button];
  } else if (screen.subviews.lastObject != _button) {
    // React Native added views to the screen since; the button stays on top of them.
    [screen bringSubviewToFront:_button];
  }
  _button.frame = frame;
  GSARegisterOwner(_ownerId, _button);
  if (appearing) {
    GSAAnimateGlassButtonIn(_button);
  }
}

- (void)placeAfterTransition:(id<UIViewControllerTransitionCoordinator>)transition
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
                                                 [strongSelf reportIfChanged];
                                                 [strongSelf layoutButton];
                                               }
                                             }];
  if (!waiting) {
    _awaitedTransition = nil;
    dispatch_async(dispatch_get_main_queue(), ^{
      __typeof(self) strongSelf = weakSelf;
      if (strongSelf != nil) {
        [strongSelf reportIfChanged];
        [strongSelf layoutButton];
      }
    });
  }
}

- (void)emitPress
{
  if (_eventEmitter != nullptr) {
    std::static_pointer_cast<const GranularSafeAreaAnchorEventEmitter>(_eventEmitter)
        ->onButtonPress(GranularSafeAreaAnchorEventEmitter::OnButtonPress{});
  }
}

@end
