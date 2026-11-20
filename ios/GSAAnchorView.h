#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/// An empty view that tells JS whether it is in a window. UIKit takes the views of screens that aren't showing out of
/// the window (screens below the top of a navigation stack, unselected tabs), so this is how a vertical bar back
/// button knows that its screen is visible.
@interface GSAAnchorView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
