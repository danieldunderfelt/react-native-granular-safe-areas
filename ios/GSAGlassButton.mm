#import "GSAGlassButton.h"

static UIButtonConfiguration *GSAGlassButtonConfiguration(void)
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

UIButton *GSAMakeGlassButton(void (^onPress)(void))
{
  UIAction *action = [UIAction actionWithHandler:^(__kindof UIAction *_) {
    onPress();
  }];
  UIButton *button = [UIButton buttonWithConfiguration:GSAGlassButtonConfiguration() primaryAction:action];
  button.pointerInteractionEnabled = YES;
  return button;
}

void GSAConfigureGlassButton(UIButton *button, NSString *systemImage, NSString *_Nullable label)
{
  UIButtonConfiguration *configuration = button.configuration;
  configuration.image = [UIImage systemImageNamed:systemImage];
  button.configuration = configuration;
  button.accessibilityLabel = label.length > 0 ? label : nil;
}

void GSAAnimateGlassButtonIn(UIButton *button)
{
  if (UIAccessibilityIsReduceMotionEnabled()) {
    return;
  }
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
  [button.layer addAnimation:scale forKey:@"gsa.appear.scale"];
  [button.layer addAnimation:fade forKey:@"gsa.appear.opacity"];
}
