#import "GSAProviderView.h"

#import "GSAMetricsMonitor.h"

#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>
#import <react/renderer/components/GranularSafeAreasSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface GSAProviderView () <RCTGranularSafeAreaProviderViewViewProtocol>
@end

@implementation GSAProviderView {
  GSAMetricsMonitor *_monitor;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

/// Every provider, so content outside any of them (a sheet, a modal) can find the one covering its window.
static NSHashTable<GSAProviderView *> *GSAProviders(void)
{
  static NSHashTable<GSAProviderView *> *providers;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    providers = [NSHashTable weakObjectsHashTable];
  });
  return providers;
}

+ (nullable GSAProviderView *)providerForView:(UIView *)view
{
  for (UIView *ancestor = view.superview; ancestor != nil; ancestor = ancestor.superview) {
    if ([ancestor isKindOfClass:GSAProviderView.class]) {
      return (GSAProviderView *)ancestor;
    }
  }
  UIWindow *window = view.window;
  if (window == nil) {
    return nil;
  }
  for (GSAProviderView *provider in GSAProviders()) {
    if (provider.window != window) {
      continue;
    }
    BOOL outermost = YES;
    for (UIView *ancestor = provider.superview; ancestor != nil && outermost; ancestor = ancestor.superview) {
      outermost = ![ancestor isKindOfClass:GSAProviderView.class];
    }
    if (outermost) {
      return provider;
    }
  }
  return nil;
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
    [GSAProviders() addObject:self];
    __weak __typeof(self) weakSelf = self;
    _monitor = [[GSAMetricsMonitor alloc] initWithView:self
                                              onChange:^(NSString *payload) {
                                                [weakSelf emitMetrics:payload];
                                              }];
  }
  return self;
}

#pragma mark - Change sources

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  [_monitor viewDidMoveToWindow];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  // This runs whenever React Native changes the provider's children, but the monitor only reports when the provider
  // itself moved or resized.
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

#pragma mark - Reporting

- (void)emitMetrics:(NSString *)payload
{
  if (_eventEmitter == nullptr) {
    return;
  }
  std::static_pointer_cast<const GranularSafeAreaProviderViewEventEmitter>(_eventEmitter)
      ->onMetricsChange({.payload = std::string(payload.UTF8String)});
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];
  // A new emitter hasn't seen anything yet.
  [_monitor resetReported];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_monitor stop];
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
  [_monitor refresh];
}

@end
