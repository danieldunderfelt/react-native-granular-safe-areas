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

@interface GSAAnchorView () <RCTGranularSafeAreaAnchorViewProtocol, RCTMountingTransactionObserving>
@end

/// Whether the screen `anchor` is in is showing: in a window, and neither hidden nor fully transparent through any of its
/// ancestors, which is how a screen can stay mounted while it isn't shown (`opacity: 0`, `display: 'none'`). The
/// anchor itself is always transparent, so it doesn't count.
static BOOL GSAIsShowing(UIView *anchor)
{
  if (anchor.window == nil || anchor.hidden) {
    return NO;
  }
  for (UIView *view = anchor.superview; view != nil; view = view.superview) {
    if (view.hidden || view.layer.hidden || view.layer.opacity < 0.01) {
      return NO;
    }
  }
  return YES;
}

@implementation GSAAnchorView {
  /// What JS currently believes. JS assumes "showing" until told otherwise, so the first frame is already right.
  BOOL _reportedInWindow;
  BOOL _checkScheduled;

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
  // Any transaction can hide or show the screen without moving it: an ancestor's opacity or display changed.
  [self reportIfChanged];
  [self layoutButton];
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
                                                 [strongSelf layoutButton];
                                               }
                                             }];
  if (!waiting) {
    _awaitedTransition = nil;
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
