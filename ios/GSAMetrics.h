#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// The UIKit bars where a view is presented, which is expensive to work out: it walks the view hierarchy. `barViews`
/// are the visible UITabBar, UIToolbar and UINavigationBar views, plus the item groups (glass capsules) of the floating
/// bar containers that hold bar items since iOS 26, including the iPhone Duo's vertical bar.
/// `containersVisible` says whether a container that can put bars in the vertical column is showing, and
/// `barItemsKnown` whether floating bar containers were found, so `barViews` lists every bar item, even none.
@interface GSAWindowBars : NSObject
@property (nonatomic, readonly) NSArray<UIView *> *barViews;
@property (nonatomic, readonly) NSArray<UIView *> *tabBarViews;
@property (nonatomic, readonly) BOOL containersVisible;
@property (nonatomic, readonly) BOOL barItemsKnown;
/// Scans the window `view` is in, every presentation: the main app and any sheets or modals on top of it. Which of
/// them cover a given view is up to that view, from the order they're drawn in.
+ (instancetype)scanForView:(UIView *)view;
@end

/// The raw facts the JS side builds regions from, for `view` and in its coordinate space: size, safe-area insets,
/// vertical bar edge, status bar frame, bar layout region, reserved regions and UIKit bars. Matches
/// `GranularSafeAreaMetrics` in src/types.ts. Nil when the view isn't in a window.
///
/// Pass `barsCache` to reuse a previous bar scan; a nil `*barsCache` is filled in when a scan happens. Frames are
/// always read fresh from the cached bar views, so a cache only goes stale when bars are added or removed.
FOUNDATION_EXTERN NSDictionary *_Nullable GSAMetricsForView(
    UIView *view,
    GSAWindowBars *_Nullable __strong *_Nullable barsCache);

/// Reads the view's reserved regions without using them. Call it from `-updateConstraints`: UIKit tracks the regions
/// read there and runs `-updateConstraints` again when they change, which is how fold and camera changes are observed.
FOUNDATION_EXTERN void GSAObserveReservedRegions(UIView *view);

/// Everything the native side can see, for every window of the app. For bug reports and for working out new devices.
FOUNDATION_EXTERN NSDictionary *GSADiagnostics(void);

/// Serializes with sorted keys, so equal metrics always produce the same string. Empty string on failure.
FOUNDATION_EXTERN NSString *GSAJSONString(id object);

NS_ASSUME_NONNULL_END
