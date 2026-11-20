#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/// Native side of `SafeAreaView`. Measures its own box in its provider and works out the insets it needs: against
/// whole bands by default, against the regions it overlaps when granular. Applies `offset` itself (on top of its own
/// transform) and reports the insets to JS for padding and margin.
///
/// It measures after every mounting transaction in its surface. A dynamic one also observes the geometry of every view
/// between it and the provider, so it follows scrolling, gestures and animations in the same frame.
@interface GSASafeAreaView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
