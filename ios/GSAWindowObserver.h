#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Stands in for a provider when the app has none: an empty view behind everything in the app's window, following the
/// window's metrics (`GSAMetricsForView`) the way a provider follows its own, and handing them to `onChange` as JSON.
/// It ignores touches and accessibility, and fills the window, so its metrics are the window's.
@interface GSAWindowObserver : NSObject

+ (instancetype)shared;

/// Starts following the app's key window, now or as soon as there is one. `onChange` gets every change, starting with
/// the current metrics.
- (void)startWithHandler:(void (^)(NSString *payload))onChange;
/// Re-reads everything, e.g. after navigation changed the bars.
- (void)refresh;

@end

NS_ASSUME_NONNULL_END
