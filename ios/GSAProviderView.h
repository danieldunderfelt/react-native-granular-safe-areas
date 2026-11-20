#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/// Native side of `GranularSafeAreaProvider`. Reports `GSAMetricsForView(self)` to JS whenever it changes.
@interface GSAProviderView : RCTViewComponentView

/// The provider a view measures in: the nearest one above it, or else the outermost one in its window. Sheets and
/// modals are presented outside the app's root view, so their content has no provider above it, but it's in the
/// same window as the root provider, which covers it.
+ (nullable GSAProviderView *)providerForView:(UIView *)view;

/// Re-scans the bars and reports if anything changed.
- (void)refresh;

@end

NS_ASSUME_NONNULL_END
