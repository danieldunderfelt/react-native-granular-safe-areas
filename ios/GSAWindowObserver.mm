#import "GSAWindowObserver.h"

#import "GSAMetricsMonitor.h"

#import <React/RCTUtils.h>

/// The empty view the observer puts behind everything in the window.
@interface GSAWindowObserverView : UIView
@property (nonatomic, readonly) GSAMetricsMonitor *monitor;
@end

@implementation GSAWindowObserverView

// UIKit only calls -updateConstraints on views that take part in constraint-based layout, and that's where reserved
// region changes are observed.
+ (BOOL)requiresConstraintBasedLayout
{
  return YES;
}

- (instancetype)initWithFrame:(CGRect)frame onChange:(void (^)(NSString *payload))onChange
{
  if (self = [super initWithFrame:frame]) {
    self.userInteractionEnabled = NO;
    self.accessibilityElementsHidden = YES;
    self.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _monitor = [[GSAMetricsMonitor alloc] initWithView:self onChange:onChange];
  }
  return self;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  [_monitor viewDidMoveToWindow];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  [_monitor viewDidLayoutSubviews];
}

- (void)safeAreaInsetsDidChange
{
  [super safeAreaInsetsDidChange];
  [_monitor viewSafeAreaInsetsDidChange];
}

- (void)updateConstraints
{
  [_monitor viewUpdateConstraints];
  [super updateConstraints];
}

@end

UIWindow *_Nullable GSAAppWindow(void)
{
  UIWindow *key = RCTKeyWindow();
  if (key != nil && !key.hidden && key.windowLevel == UIWindowLevelNormal && key.rootViewController != nil) {
    return key;
  }
  UIWindow *fallback = nil;
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) {
      continue;
    }
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    BOOL active = scene.activationState == UISceneActivationStateForegroundActive;
    for (UIWindow *window in windowScene.windows) {
      if (window.hidden || window.windowLevel != UIWindowLevelNormal || window.rootViewController == nil) {
        continue;
      }
      if (active && window.isKeyWindow) {
        return window;
      }
      if (fallback == nil || active) {
        fallback = window;
      }
    }
  }
  return fallback ?: key;
}

@implementation GSAWindowObserver {
  GSAWindowObserverView *_Nullable _view;
  void (^_Nullable _onChange)(NSString *payload);
}

+ (instancetype)shared
{
  static GSAWindowObserver *shared;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [GSAWindowObserver new];
  });
  return shared;
}

- (instancetype)init
{
  if (self = [super init]) {
    // Keep following key-window changes: a transient splash, dev-launcher or alert window may be key early in launch,
    // or a reload/scene transition may replace the window.
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(windowDidChange:)
                                               name:UIWindowDidBecomeKeyNotification
                                             object:nil];
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(windowDidChange:)
                                               name:UIWindowDidBecomeVisibleNotification
                                             object:nil];
  }
  return self;
}

- (void)dealloc
{
  [NSNotificationCenter.defaultCenter removeObserver:self];
}

- (void)startWithHandler:(void (^)(NSString *payload))onChange
{
  _onChange = [onChange copy];
  if ([self attachIfNeeded]) {
    [_view.monitor resetReported];
  }
}

- (void)windowDidChange:(NSNotification *)notification
{
  if (_onChange != nil) {
    [self attachIfNeeded];
  }
}

- (BOOL)attachIfNeeded
{
  UIWindow *window = GSAAppWindow();
  if (window == nil) {
    return NO;
  }
  if (_view != nil && _view.window == window) {
    return YES;
  }
  if (_view != nil) {
    [_view.monitor stop];
    [_view removeFromSuperview];
    _view.frame = window.bounds;
  } else {
    __weak __typeof(self) weakSelf = self;
    _view = [[GSAWindowObserverView alloc] initWithFrame:window.bounds
                                                onChange:^(NSString *payload) {
                                                  __typeof(self) strongSelf = weakSelf;
                                                  if (strongSelf != nil && strongSelf->_onChange != nil) {
                                                    strongSelf->_onChange(payload);
                                                  }
                                                }];
  }
  // Behind everything, so it never covers anything, including views presented later.
  [window insertSubview:_view atIndex:0];
  return YES;
}

- (void)refresh
{
  if ([self attachIfNeeded]) {
    [_view.monitor refresh];
  }
}

@end
