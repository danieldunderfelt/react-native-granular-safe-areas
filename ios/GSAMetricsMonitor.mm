#import "GSAMetricsMonitor.h"

#import "GSAMetrics.h"

static void *GSABarLayerContext = &GSABarLayerContext;

/// Layer properties that change when a bar grows, shrinks, moves, hides or fades. UIKit sets the model values at the
/// start of an animation, so a change is seen as soon as it begins, not when it ends.
static NSArray<NSString *> *GSAObservedBarKeys(void)
{
  return @[ @"bounds", @"position", @"hidden", @"opacity" ];
}

/// How often to re-scan while there is something that no callback fully covers: UIKit bars (a tab switch adds and
/// removes bars without telling anyone) or a side column the system may put bars in (iPhone Duo). One walk of the view
/// hierarchy, and the timer's tolerance lets the system batch it with other wake-ups. Apps without UIKit bars on
/// devices without a side column never run it.
static const NSTimeInterval GSAWatchdogInterval = 1.0;

@implementation GSAMetricsMonitor {
  __weak UIView *_view;
  void (^_onChange)(NSString *payload);
  NSString *_Nullable _lastPayload;
  BOOL _updateScheduled;
  /// The last scan of the window's bars. Cleared by the events that can add or remove bars.
  GSAWindowBars *_Nullable _barsCache;
  /// Layers of the cached bars, observed so a bar changing size or visibility reports straight away.
  NSArray<CALayer *> *_Nullable _observedLayers;
  NSTimer *_Nullable _watchdog;
  CGSize _lastBoundsSize;
  CGRect _lastFrameInWindow;
}

- (instancetype)initWithView:(UIView *)view onChange:(void (^)(NSString *payload))onChange
{
  if (self = [super init]) {
    _view = view;
    _onChange = [onChange copy];
    if (@available(iOS 17.0, *)) {
      // Poses change the size classes; a right-to-left switch changes which side "trailing" is.
      NSMutableArray<UITrait> *traits = [@[
        UITraitHorizontalSizeClass.class, UITraitVerticalSizeClass.class, UITraitLayoutDirection.class
      ] mutableCopy];
#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 270100
      if (@available(iOS 27.1, *)) {
        [traits addObjectsFromArray:UITraitCollection.systemTraitsAffectingVerticalBarEdge];
      }
#endif
      [view registerForTraitChanges:traits withTarget:self action:@selector(refresh)];
    }
    // Anything can have changed while the app was in the background, e.g. a Live Activity started.
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(refresh)
                                               name:UISceneDidActivateNotification
                                             object:nil];
  }
  return self;
}

- (void)dealloc
{
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self stopObservingBars];
  [_watchdog invalidate];
}

#pragma mark - Host callbacks

- (void)viewDidMoveToWindow
{
  UIView *view = _view;
  if (view.window != nil) {
    [view setNeedsUpdateConstraints];
    [self refresh];
  } else {
    [self stopObservingBars];
    [self setWatchdogRunning:NO];
    _barsCache = nil;
    _lastFrameInWindow = CGRectZero;
  }
}

- (void)viewDidLayoutSubviews
{
  // Only the host's own size or position can change what it reports; everything else has its own callback.
  UIView *view = _view;
  CGRect frameInWindow = [view convertRect:view.bounds toView:nil];
  if (CGRectEqualToRect(frameInWindow, _lastFrameInWindow)) {
    return;
  }
  _lastFrameInWindow = frameInWindow;
  if (!CGSizeEqualToSize(view.bounds.size, _lastBoundsSize)) {
    _lastBoundsSize = view.bounds.size;
    _barsCache = nil;
  }
  [self scheduleUpdate];
}

- (void)viewSafeAreaInsetsDidChange
{
  [self refresh];
}

- (void)viewUpdateConstraints
{
  UIView *view = _view;
  if (view != nil) {
    GSAObserveReservedRegions(view);
  }
  [self refresh];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context
{
  if (context == GSABarLayerContext) {
    // A known bar changed; its frame is read fresh from the cached view, so no re-scan is needed.
    [self scheduleUpdate];
  } else {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
  }
}

#pragma mark - Reporting

- (void)refresh
{
  _barsCache = nil;
  [self scheduleUpdate];
}

- (void)resetReported
{
  _lastPayload = nil;
  [self scheduleUpdate];
}

- (void)stop
{
  _lastPayload = nil;
  _barsCache = nil;
  _lastBoundsSize = CGSizeZero;
  _lastFrameInWindow = CGRectZero;
  [self stopObservingBars];
  [self setWatchdogRunning:NO];
}

/// Coalesces the change sources, which tend to fire together, into one read on the next main-queue turn.
- (void)scheduleUpdate
{
  if (_updateScheduled) {
    return;
  }
  _updateScheduled = YES;
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof(self) strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;
    }
    strongSelf->_updateScheduled = NO;
    [strongSelf emitIfChanged];
  });
}

- (void)emitIfChanged
{
  UIView *view = _view;
  if (view == nil || view.window == nil || CGSizeEqualToSize(view.bounds.size, CGSizeZero)) {
    return;
  }
  NSDictionary *metrics = GSAMetricsForView(view, &_barsCache);
  if (metrics == nil) {
    return;
  }
  [self observeBars:_barsCache.barViews];
  [self setWatchdogRunning:metrics[@"verticalBarEdge"] != NSNull.null || _barsCache.barViews.count > 0];

  NSString *payload = GSAJSONString(metrics);
  if (payload.length == 0 || [payload isEqualToString:_lastPayload]) {
    return;
  }
  _lastPayload = payload;
  _onChange(payload);
}

#pragma mark - Bar observation

- (void)observeBars:(NSArray<UIView *> *_Nullable)bars
{
  NSMutableArray<CALayer *> *layers = [NSMutableArray arrayWithCapacity:bars.count];
  for (UIView *bar in bars) {
    [layers addObject:bar.layer];
  }
  if ([layers isEqualToArray:_observedLayers ?: @[]]) {
    return;
  }
  [self stopObservingBars];
  for (CALayer *layer in layers) {
    for (NSString *key in GSAObservedBarKeys()) {
      [layer addObserver:self forKeyPath:key options:0 context:GSABarLayerContext];
    }
  }
  // Holding the layers keeps them alive until they are unobserved, so removing the observers is always safe.
  _observedLayers = layers;
}

- (void)stopObservingBars
{
  for (CALayer *layer in _observedLayers) {
    for (NSString *key in GSAObservedBarKeys()) {
      [layer removeObserver:self forKeyPath:key context:GSABarLayerContext];
    }
  }
  _observedLayers = nil;
}

- (void)setWatchdogRunning:(BOOL)running
{
  if (running && _watchdog == nil) {
    __weak __typeof(self) weakSelf = self;
    _watchdog = [NSTimer scheduledTimerWithTimeInterval:GSAWatchdogInterval
                                                repeats:YES
                                                  block:^(NSTimer *timer) {
                                                    [weakSelf refresh];
                                                  }];
    _watchdog.tolerance = GSAWatchdogInterval / 2;
  } else if (!running && _watchdog != nil) {
    [_watchdog invalidate];
    _watchdog = nil;
  }
}

@end
