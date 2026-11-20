#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// The system back button of the iPhone Duo's vertical bar: a glass circle with a semibold symbol in the label color,
/// like the one UIKit shows for a navigation controller.
FOUNDATION_EXTERN UIButton *GSAMakeGlassButton(void (^onPress)(void));

/// Sets the button's SF Symbol and VoiceOver label.
FOUNDATION_EXTERN void GSAConfigureGlassButton(UIButton *button, NSString *systemImage, NSString *_Nullable label);

/// Brings the button in the way bar items appear: a quick scale and fade, unless Reduce Motion is on. Layer animations
/// only, so the model values stay put.
FOUNDATION_EXTERN void GSAAnimateGlassButtonIn(UIButton *button);

NS_ASSUME_NONNULL_END
