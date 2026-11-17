#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/// Native side of `GranularSafeAreaProvider`. Reports `GSAMetricsForView(self)` to JS whenever it changes.
@interface GSAProviderView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
