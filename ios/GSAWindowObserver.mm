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

- (void)startWithHandler:(void (^)(NSString *payload))onChange
{
  _onChange = [onChange copy];
  if (_view != nil) {
    [_view.monitor resetReported];
    return;
  }
  if (![self attach]) {
    // No window yet, early in launch: try again when one becomes key.
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(windowDidBecomeKey:)
                                               name:UIWindowDidBecomeKeyNotification
                                             object:nil];
  }
}

- (void)windowDidBecomeKey:(NSNotification *)notification
{
  if ([self attach]) {
    [NSNotificationCenter.defaultCenter removeObserver:self name:UIWindowDidBecomeKeyNotification object:nil];
  }
}

- (BOOL)attach
{
  UIWindow *window = RCTKeyWindow();
  if (window == nil) {
    return NO;
  }
  __weak __typeof(self) weakSelf = self;
  _view = [[GSAWindowObserverView alloc] initWithFrame:window.bounds
                                              onChange:^(NSString *payload) {
                                                __typeof(self) strongSelf = weakSelf;
                                                if (strongSelf != nil && strongSelf->_onChange != nil) {
                                                  strongSelf->_onChange(payload);
                                                }
                                              }];
  // Behind everything, so it never covers anything, including views presented later.
  [window insertSubview:_view atIndex:0];
  return YES;
}

- (void)refresh
{
  [_view.monitor refresh];
}

@end
