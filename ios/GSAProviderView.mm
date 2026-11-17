#import "GSAProviderView.h"

#import "GSAMetrics.h"

#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>
#import <react/renderer/components/GranularSafeAreasSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

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

@interface GSAProviderView () <RCTGranularSafeAreaProviderViewViewProtocol>
@end

@implementation GSAProviderView {
  NSString *_Nullable _lastPayload;
  BOOL _updateScheduled;
  /// The last scan of the bars where this view is presented. Cleared by the events that can add or remove bars.
  GSAWindowBars *_Nullable _barsCache;
  /// Layers of the cached bars, observed so a bar changing size or visibility reports straight away.
  NSArray<CALayer *> *_Nullable _observedLayers;
  NSTimer *_Nullable _watchdog;
  CGSize _lastBoundsSize;
  CGRect _lastFrameInWindow;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GranularSafeAreaProviderViewComponentDescriptor>();
}

// UIKit only calls -updateConstraints on views that take part in constraint-based layout, and that's where reserved
// region changes (the camera area growing for a Live Activity, the fold, the inner camera) are observed.
+ (BOOL)requiresConstraintBasedLayout
{
  return YES;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GranularSafeAreaProviderViewProps>();
    _props = defaultProps;

    if (@available(iOS 17.0, *)) {
      // Poses change the size classes; a right-to-left switch changes which side "trailing" is.
      [self registerForTraitChanges:@[
        UITraitHorizontalSizeClass.class, UITraitVerticalSizeClass.class, UITraitLayoutDirection.class
      ]
                         withAction:@selector(refresh)];
    }
    // Anything can have changed while the app was in the background, e.g. a Live Activity started.
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(sceneDidActivate:)
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

#pragma mark - Change sources

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [self setNeedsUpdateConstraints];
    [self refresh];
  } else {
    [self stopObservingBars];
    [self setWatchdogRunning:NO];
    _barsCache = nil;
    _lastFrameInWindow = CGRectZero;
  }
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  // This runs whenever React Native changes the provider's children. Only the provider's own size or position can
  // change what it reports; everything else has its own callback.
  CGRect frameInWindow = [self convertRect:self.bounds toView:nil];
  if (CGRectEqualToRect(frameInWindow, _lastFrameInWindow)) {
    return;
  }
  _lastFrameInWindow = frameInWindow;
  if (!CGSizeEqualToSize(self.bounds.size, _lastBoundsSize)) {
    _lastBoundsSize = self.bounds.size;
    _barsCache = nil;
  }
  [self scheduleUpdate];
}

- (void)sceneDidActivate:(NSNotification *)notification
{
  [self refresh];
}

- (void)safeAreaInsetsDidChange
{
  [super safeAreaInsetsDidChange];
  [self refresh];
}

- (void)updateConstraints
{
  GSAObserveReservedRegions(self);
  [self refresh];
  [super updateConstraints];
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

/// Coalesces the change sources above, which tend to fire together, into one read on the next main-queue turn.
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
  if (_eventEmitter == nullptr || self.window == nil || CGSizeEqualToSize(self.bounds.size, CGSizeZero)) {
    return;
  }
  NSDictionary *metrics = GSAMetricsForView(self, &_barsCache);
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
  std::static_pointer_cast<const GranularSafeAreaProviderViewEventEmitter>(_eventEmitter)
      ->onMetricsChange({.payload = std::string(payload.UTF8String)});
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];
  // A new emitter hasn't seen anything yet.
  _lastPayload = nil;
  [self scheduleUpdate];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  _lastPayload = nil;
  _barsCache = nil;
  _lastBoundsSize = CGSizeZero;
  _lastFrameInWindow = CGRectZero;
  [self stopObservingBars];
  [self setWatchdogRunning:NO];
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

#pragma mark - Commands

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTGranularSafeAreaProviderViewHandleCommand(self, commandName, args);
}

/// Re-scans the bars and reports if anything changed. Also the `refresh` command, which JS sends when new granular
/// views mount, e.g. after navigation changed the bars.
- (void)refresh
{
  _barsCache = nil;
  [self scheduleUpdate];
}

@end
