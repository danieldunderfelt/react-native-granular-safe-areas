#import "GSABarButtonView.h"

#import <React/RCTConversions.h>
#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>
#import <react/renderer/components/GranularSafeAreasSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

/// Matches the system back button in the vertical bar: a glass circle with a semibold chevron in the label color.
static UIButtonConfiguration *GSABarButtonConfiguration(void)
{
  UIButtonConfiguration *configuration = nil;
#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 260000
  if (@available(iOS 26.0, *)) {
    configuration = [UIButtonConfiguration glassButtonConfiguration];
  }
#endif
  if (configuration == nil) {
    configuration = [UIButtonConfiguration grayButtonConfiguration];
  }
  configuration.cornerStyle = UIButtonConfigurationCornerStyleCapsule;
  configuration.preferredSymbolConfigurationForImage =
      [UIImageSymbolConfiguration configurationWithPointSize:17 weight:UIImageSymbolWeightSemibold];
  configuration.contentInsets = NSDirectionalEdgeInsetsZero;
  return configuration;
}

@interface GSABarButtonView () <RCTGranularSafeAreaBarButtonViewProtocol>
@end

@implementation GSABarButtonView {
  UIButton *_button;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GranularSafeAreaBarButtonComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GranularSafeAreaBarButtonProps>();
    _props = defaultProps;

    __weak __typeof(self) weakSelf = self;
    UIAction *action = [UIAction actionWithHandler:^(__kindof UIAction *_) {
      [weakSelf emitPress];
    }];
    _button = [UIButton buttonWithConfiguration:GSABarButtonConfiguration() primaryAction:action];
    _button.pointerInteractionEnabled = YES;
    self.contentView = _button;
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldButtonProps = *std::static_pointer_cast<const GranularSafeAreaBarButtonProps>(_props);
  const auto &newButtonProps = *std::static_pointer_cast<const GranularSafeAreaBarButtonProps>(props);

  if (newButtonProps.systemImage != oldButtonProps.systemImage || _button.configuration.image == nil) {
    UIButtonConfiguration *configuration = _button.configuration;
    configuration.image = [UIImage systemImageNamed:RCTNSStringFromString(newButtonProps.systemImage)];
    _button.configuration = configuration;
  }
  if (newButtonProps.label != oldButtonProps.label) {
    _button.accessibilityLabel = RCTNSStringFromStringNilIfEmpty(newButtonProps.label);
  }

  [super updateProps:props oldProps:oldProps];
}

// Appear the way bar items do: a quick scale and fade. Moving between screens that both show the button keeps the same
// view, so this only plays when the button first shows up.
- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window == nil || UIAccessibilityIsReduceMotionEnabled()) {
    return;
  }
  // Layer animations only: the model values stay put, so a layout pass from React Native mid-animation is harmless.
  CASpringAnimation *scale = [CASpringAnimation animationWithKeyPath:@"transform.scale"];
  scale.fromValue = @0.6;
  scale.toValue = @1;
  scale.stiffness = 320;
  scale.damping = 22;
  scale.duration = scale.settlingDuration;
  CABasicAnimation *fade = [CABasicAnimation animationWithKeyPath:@"opacity"];
  fade.fromValue = @0;
  fade.toValue = @1;
  fade.duration = 0.2;
  [_button.layer addAnimation:scale forKey:@"gsa.appear.scale"];
  [_button.layer addAnimation:fade forKey:@"gsa.appear.opacity"];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_button.layer removeAllAnimations];
}

- (void)emitPress
{
  if (_eventEmitter != nullptr) {
    std::static_pointer_cast<const GranularSafeAreaBarButtonEventEmitter>(_eventEmitter)
        ->onBarButtonPress(GranularSafeAreaBarButtonEventEmitter::OnBarButtonPress{});
  }
}

@end
