#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Follows the metrics of a host view (`GSAMetricsForView`) as the system UI around it changes, and calls `onChange`
/// with them as JSON whenever they do. Used by the provider view, and by the window observer that stands in for a
/// provider when there is none.
///
/// The host forwards its UIKit callbacks: `-didMoveToWindow`, `-layoutSubviews`, `-safeAreaInsetsDidChange` and
/// `-updateConstraints`, which must also return YES from `+requiresConstraintBasedLayout`: UIKit only tracks the
/// reserved regions read in `-updateConstraints` for views taking part in constraint-based layout.
@interface GSAMetricsMonitor : NSObject

- (instancetype)initWithView:(UIView *)view onChange:(void (^)(NSString *payload))onChange NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

- (void)viewDidMoveToWindow;
- (void)viewDidLayoutSubviews;
- (void)viewSafeAreaInsetsDidChange;
/// Reads the reserved regions, so UIKit runs `-updateConstraints` again when they change, and reports.
- (void)viewUpdateConstraints;

/// Re-scans the bars and reports if anything changed.
- (void)refresh;
/// Forgets what was reported, so the next report goes out even if nothing changed (a new listener).
- (void)resetReported;
/// Stops observing, e.g. when the host is recycled.
- (void)stop;

@end

NS_ASSUME_NONNULL_END
