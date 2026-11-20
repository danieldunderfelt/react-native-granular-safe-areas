#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/// Native side of `<GranularSafeAreaView dynamic>`. A view that follows its own position in the provider on the UI
/// thread and moves clear of the regions it overlaps right now: as the scroll views around it scroll (in the same
/// frame) and after every mounting transaction (layout changes anywhere in the surface).
@interface GSADynamicView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
