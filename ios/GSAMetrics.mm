#import "GSAMetrics.h"

#import "GSAOwners.h"

#import <React/RCTViewComponentView.h>
#import <sys/utsname.h>

// The iPhone Duo APIs (reserved regions, verticalBarEdge, bar layout regions) ship in the iOS 27.1 SDK. Building with
// an older Xcode compiles them out; the JS side then keeps every inset band whole.
#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 270100
#define GSA_HAS_IOS_27_1_SDK 1
#else
#define GSA_HAS_IOS_27_1_SDK 0
#endif

#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 260000
#define GSA_HAS_IOS_26_SDK 1
#else
#define GSA_HAS_IOS_26_SDK 0
#endif

static NSNumber *GSANumber(CGFloat value)
{
  return @(isfinite(value) ? value : 0);
}

static NSDictionary *GSARect(CGRect rect)
{
  return @{
    @"x" : GSANumber(rect.origin.x),
    @"y" : GSANumber(rect.origin.y),
    @"width" : GSANumber(rect.size.width),
    @"height" : GSANumber(rect.size.height),
  };
}

static NSDictionary *GSAInsets(UIEdgeInsets insets)
{
  return @{
    @"top" : GSANumber(insets.top),
    @"right" : GSANumber(insets.right),
    @"bottom" : GSANumber(insets.bottom),
    @"left" : GSANumber(insets.left),
  };
}

static UIWindow *_Nullable GSAWindowOf(UIView *view)
{
  return [view isKindOfClass:UIWindow.class] ? (UIWindow *)view : view.window;
}

static NSString *GSADeviceModel(void)
{
  static NSString *model = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
#if TARGET_OS_SIMULATOR
    NSString *sim = NSProcessInfo.processInfo.environment[@"SIMULATOR_MODEL_IDENTIFIER"];
    if (sim.length > 0) {
      model = sim;
      return;
    }
#endif
    struct utsname systemInfo;
    uname(&systemInfo);
    model = @(systemInfo.machine);
  });
  return model;
}

static NSString *_Nullable GSAVerticalBarEdgeName(UITraitCollection *traits)
{
#if GSA_HAS_IOS_27_1_SDK
  if (@available(iOS 27.1, *)) {
    switch (traits.verticalBarEdge) {
      case UIVerticalBarEdgeLeading:
        return @"leading";
      case UIVerticalBarEdgeTrailing:
        return @"trailing";
      default:
        return nil;
    }
  }
#endif
  return nil;
}

/// The status bar frame in `view`'s coordinates, or nil when it's hidden or not over the window.
static NSValue *_Nullable GSAStatusBarFrame(UIView *view)
{
  UIWindow *window = GSAWindowOf(view);
  UIWindowScene *scene = window.windowScene;
  UIStatusBarManager *manager = scene.statusBarManager;
  if (manager == nil || manager.isStatusBarHidden || CGRectIsEmpty(manager.statusBarFrame)) {
    return nil;
  }
  // The status bar runs along the top of the screen. For an iPad window that doesn't fill the screen, UIKit reports
  // it at the top of the window as if the window were the screen, so it's clipped to where the window really is.
  UIScreen *screen = scene.screen;
  if (screen != nil) {
    CGRect bar = [screen.coordinateSpace convertRect:manager.statusBarFrame fromCoordinateSpace:scene.coordinateSpace];
    CGRect windowInScreen = [window convertRect:window.bounds toCoordinateSpace:screen.coordinateSpace];
    if (!CGRectEqualToRect(windowInScreen, screen.bounds)) {
      bar = CGRectIntersection(
          CGRectMake(0, 0, CGRectGetWidth(screen.bounds), CGRectGetHeight(manager.statusBarFrame)), windowInScreen);
      if (CGRectIsEmpty(bar)) {
        return nil;
      }
    }
    return [NSValue valueWithCGRect:[view convertRect:bar fromCoordinateSpace:screen.coordinateSpace]];
  }
  return [NSValue valueWithCGRect:[view convertRect:manager.statusBarFrame fromCoordinateSpace:scene.coordinateSpace]];
}

#if GSA_HAS_IOS_26_SDK
/// The window controls (close, minimize, arrange) of an iPad window that doesn't fill the screen, in `view`'s
/// coordinates, with the system's margins around them, or nil. UIKit only tells where they are through the
/// corner-adapted safe area: a header level with them has to start past them (the horizontal adaptation), anything
/// beside them below them (the vertical one). The display's and the window's rounded corners adapt it too, but
/// evenly on both sides, so only a top corner that sticks out further than the other one holds controls.
API_AVAILABLE(ios(26.0))
static NSDictionary *_Nullable GSAWindowControls(UIView *view, UIEdgeInsets insets)
{
  if (view.traitCollection.userInterfaceIdiom != UIUserInterfaceIdiomPad) {
    return nil;
  }
  UIEdgeInsets vertical = [view
      edgeInsetsForLayoutRegion:[UIViewLayoutRegion
                                    safeAreaLayoutRegionWithCornerAdaptation:UIViewLayoutRegionAdaptivityAxisVertical]];
  UIEdgeInsets horizontal = [view
      edgeInsetsForLayoutRegion:[UIViewLayoutRegion
                                    safeAreaLayoutRegionWithCornerAdaptation:UIViewLayoutRegionAdaptivityAxisHorizontal]];
  CGFloat left = horizontal.left - insets.left;
  CGFloat right = horizontal.right - insets.right;
  if (vertical.top <= insets.top + 1 || fabs(left - right) <= 1) {
    return nil;
  }
  CGFloat width = left > right ? horizontal.left : horizontal.right;
  CGFloat x = left > right ? 0 : view.bounds.size.width - width;
  return GSARect(CGRectMake(x, 0, width, vertical.top));
}
#endif

/// Standard UIKit bars, plus private vertical bar containers matched by name. The Phase 0 probe output decides
/// whether the name match is needed; see `viewsNearEdges` in the diagnostics.
static BOOL GSAIsBarView(UIView *view)
{
  return [view isKindOfClass:UITabBar.class] || [view isKindOfClass:UIToolbar.class] ||
      [view isKindOfClass:UINavigationBar.class];
}

/// Since iOS 26, UINavigationController and UITabBarController draw their bar items in a floating bar container
/// (`_UIFloatingBarContainerView`): a transparent view covering the whole controller, with one glass capsule per item
/// group wherever the system puts it. On the iPhone Duo that is the vertical bar: the back button under the status
/// cluster, header items below it, the tab bar platter at the bottom. Verified on the iOS 27.2 Duo simulator.
static BOOL GSAIsFloatingBarContainer(UIView *view)
{
  return [NSStringFromClass(view.class) containsString:@"FloatingBarContainer"];
}

/// The item groups in a floating bar container: its outermost descendants that are smaller than the container. The
/// views above them are wrappers that either cover the whole container or have no size at all.
static void GSACollectFloatingBarItems(UIView *view, UIView *container, NSMutableArray<UIView *> *items, NSUInteger depth)
{
  if (depth > 32) {
    return;
  }
  CGSize containerSize = container.bounds.size;
  if ((containerSize.width <= 1 || containerSize.height <= 1) && container.window != nil) {
    containerSize = container.window.bounds.size;
  }
  for (UIView *subview in view.subviews) {
    if (subview.hidden || subview.alpha < 0.01) {
      continue;
    }
    CGRect frame = [container convertRect:subview.bounds fromView:subview];
    BOOL wrapper = CGRectIsEmpty(frame) ||
        (containerSize.width > 1 && containerSize.height > 1 && frame.size.width >= containerSize.width - 1 &&
         frame.size.height >= containerSize.height - 1);
    if (wrapper) {
      GSACollectFloatingBarItems(subview, container, items, depth + 1);
    } else {
      [items addObject:subview];
    }
  }
}

/// The visible bars in `view`'s subtree: UIKit bars, and the item groups of floating bar containers. Bars are leaves:
/// their insides aren't scanned.
static void GSACollectBars(
    UIView *view,
    NSMutableArray<UIView *> *bars,
    NSUInteger depth,
    BOOL *foundFloatingBars)
{
  if (view.hidden || view.alpha < 0.01 || depth > 256) {
    return;
  }
  if (GSAIsBarView(view)) {
    [bars addObject:view];
    return;
  }
  if (GSAIsFloatingBarContainer(view)) {
    *foundFloatingBars = YES;
    GSACollectFloatingBarItems(view, view, bars, 0);
    return;
  }
  for (UIView *subview in view.subviews) {
    GSACollectBars(subview, bars, depth + 1, foundFloatingBars);
  }
}

/// Whether `view` and every ancestor are shown. A cached bar can be hidden through an ancestor later. Reads the
/// layers, which is also what the provider observes, so a change that only touches the layer counts too.
static BOOL GSAIsVisible(UIView *view)
{
  for (UIView *current = view; current != nil; current = current.superview) {
    if (current.hidden || current.layer.hidden || current.layer.opacity < 0.01) {
      return NO;
    }
  }
  return !CGRectIsEmpty(view.bounds);
}

/// Whether a visible container in this part of the controller tree can put bars in the vertical column. Deliberately
/// broad: a tab bar controller counts even if UIKit hides its UITabBar in favor of a vertical one.
static BOOL GSAHasVisibleBarContainer(UIViewController *controller, NSUInteger depth)
{
  if (depth > 32 || !controller.isViewLoaded || controller.view.window == nil) {
    return NO;
  }
  if ([controller isKindOfClass:UITabBarController.class]) {
    return YES;
  }
  if ([controller isKindOfClass:UINavigationController.class]) {
    UINavigationController *navigation = (UINavigationController *)controller;
    if (!navigation.isNavigationBarHidden || !navigation.isToolbarHidden) {
      return YES;
    }
  }
  for (UIViewController *child in controller.childViewControllers) {
    if (GSAHasVisibleBarContainer(child, depth + 1)) {
      return YES;
    }
  }
  return NO;
}

@implementation GSAWindowBars

- (instancetype)initWithBarViews:(NSArray<UIView *> *)barViews
               containersVisible:(BOOL)containersVisible
                   barItemsKnown:(BOOL)barItemsKnown
{
  if (self = [super init]) {
    _barViews = barViews;
    _containersVisible = containersVisible;
    _barItemsKnown = barItemsKnown;
  }
  return self;
}

+ (instancetype)scanForView:(UIView *)view
{
  // Every presentation in the window: each view decides for itself which bars are drawn on top of it, so a sheet's
  // content ignores the bars of the screen it covers, and the screen's content avoids the sheet's.
  UIWindow *window = GSAWindowOf(view);
  NSMutableArray<UIView *> *bars = [NSMutableArray new];
  BOOL foundFloatingBars = NO;
  if (window != nil) {
    GSACollectBars(window, bars, 0, &foundFloatingBars);
  }
  if (foundFloatingBars) {
    // With floating bars, a vertical UITabBar or UIToolbar is a placeholder: on the Duo, UITabBarController keeps an
    // empty UITabBar running the full height of the column, while the tabs are drawn in a platter in the floating bar
    // container. Its items are already in `bars`.
    NSIndexSet *placeholders = [bars indexesOfObjectsPassingTest:^BOOL(UIView *bar, NSUInteger index, BOOL *stop) {
      return GSAIsBarView(bar) && ![bar isKindOfClass:UINavigationBar.class] &&
          bar.bounds.size.height > bar.bounds.size.width;
    }];
    [bars removeObjectsAtIndexes:placeholders];
  }
  BOOL containersVisible = NO;
  for (UIViewController *controller = window.rootViewController; controller != nil && !containersVisible;
       controller = controller.presentedViewController) {
    containersVisible = GSAHasVisibleBarContainer(controller, 0);
  }
  return [[self alloc] initWithBarViews:bars containersVisible:containersVisible barItemsKnown:foundFloatingBars];
}

@end

#if GSA_HAS_IOS_27_1_SDK
API_AVAILABLE(ios(27.1))
static NSArray<NSDictionary *> *GSAReservedRegions(UIView *view, UIViewReservedRegionKind *kind, BOOL details)
{
  NSMutableArray<NSDictionary *> *regions = [NSMutableArray new];
  for (UIViewReservedRegion *region in [view reservedRegionsOfKind:kind
                                                           options:UIViewReservedRegionQueryOptionsIncludeInactive]) {
    NSMutableDictionary *entry = [GSARect(region.frame) mutableCopy];
    entry[@"active"] = @(region.isActive);
    if (details) {
      entry[@"margins"] = GSAInsets(region.margins);
      entry[@"identifier"] = region.identifier.description ?: @"";
    }
    [regions addObject:entry];
  }
  return regions;
}

API_AVAILABLE(ios(27.1))
static UIEdgeInsets GSABarRegionInsets(UIView *view, NSString *barEdge, CGFloat extent)
{
  NSDirectionalRectEdge edge =
      [barEdge isEqualToString:@"leading"] ? NSDirectionalRectEdgeLeading : NSDirectionalRectEdgeTrailing;
  return [view edgeInsetsForLayoutRegion:[UIViewLayoutRegion layoutRegionForBarOnDirectionalEdge:edge extent:extent]];
}
#endif

void GSAObserveReservedRegions(UIView *view)
{
#if GSA_HAS_IOS_27_1_SDK
  if (@available(iOS 27.1, *)) {
    [view reservedRegionsOfKind:[UIViewReservedRegionKind occlusionRegionKind]
                        options:UIViewReservedRegionQueryOptionsIncludeInactive];
    [view reservedRegionsOfKind:[UIViewReservedRegionKind divisionRegionKind]
                        options:UIViewReservedRegionQueryOptionsIncludeInactive];
  }
#endif
}

NSDictionary *_Nullable GSAMetricsForView(UIView *view, GSAWindowBars *_Nullable __strong *_Nullable barsCache)
{
  UIWindow *window = GSAWindowOf(view);
  if (window == nil) {
    return nil;
  }

  UIEdgeInsets insets = view.safeAreaInsets;
  NSString *barEdge = GSAVerticalBarEdgeName(view.traitCollection);
  NSMutableDictionary *metrics = [@{
    @"platform" : @"ios",
    @"width" : GSANumber(view.bounds.size.width),
    @"height" : GSANumber(view.bounds.size.height),
    @"insets" : GSAInsets(insets),
    @"verticalBarEdge" : barEdge ?: NSNull.null,
    @"layoutDirection" : view.effectiveUserInterfaceLayoutDirection == UIUserInterfaceLayoutDirectionRightToLeft
        ? @"rtl"
        : @"ltr",
    @"statusBar" : NSNull.null,
    @"barRegionInsets" : NSNull.null,
    @"occlusions" : @[],
    @"divisions" : @[],
    @"systemBars" : @[],
    @"barContainersVisible" : @NO,
    @"barItemsKnown" : @NO,
    @"reservedRegionsSupported" : @NO,
  } mutableCopy];

  // Where UIKit puts a tab bar: at the top of an iPad window of regular width, at the bottom otherwise (or in the vertical
  // bar, which `verticalBarEdge` tells).
  UITraitCollection *traits = view.traitCollection;
  metrics[@"idiom"] = traits.userInterfaceIdiom == UIUserInterfaceIdiomPad ? @"pad" : @"phone";
  metrics[@"horizontalSizeClass"] =
      traits.horizontalSizeClass == UIUserInterfaceSizeClassRegular ? @"regular" : @"compact";
  metrics[@"deviceModel"] = GSADeviceModel();
  metrics[@"systemVersion"] = UIDevice.currentDevice.systemVersion;

  NSValue *statusBar = GSAStatusBarFrame(view);
  if (statusBar != nil) {
    metrics[@"statusBar"] = GSARect(statusBar.CGRectValue);
  }

#if GSA_HAS_IOS_26_SDK
  if (@available(iOS 26.0, *)) {
    NSDictionary *windowControls = GSAWindowControls(view, insets);
    if (windowControls != nil) {
      metrics[@"windowControls"] = windowControls;
    }
  }
#endif

#if GSA_HAS_IOS_27_1_SDK
  if (@available(iOS 27.1, *)) {
    metrics[@"reservedRegionsSupported"] = @YES;
    metrics[@"occlusions"] = GSAReservedRegions(view, [UIViewReservedRegionKind occlusionRegionKind], NO);
    metrics[@"divisions"] = GSAReservedRegions(view, [UIViewReservedRegionKind divisionRegionKind], NO);

    if (barEdge != nil) {
      // The bar column's width is the side inset; which side is resolved on the JS side.
      CGFloat extent = MAX(insets.left, insets.right);
      if (extent > 0) {
        metrics[@"barRegionInsets"] = GSAInsets(GSABarRegionInsets(view, barEdge, extent));
      }
    }
  }
#endif

  GSAWindowBars *windowBars = barsCache != nil ? *barsCache : nil;
  if (windowBars == nil) {
    windowBars = [GSAWindowBars scanForView:view];
    if (barsCache != nil) {
      *barsCache = windowBars;
    }
  }
  NSMutableArray<NSDictionary *> *systemBars = [NSMutableArray new];
  for (UIView *bar in windowBars.barViews) {
    if (bar.window == window && GSAIsVisible(bar)) {
      NSMutableDictionary *entry = [GSARect([view convertRect:bar.bounds fromView:bar]) mutableCopy];
      // Which view draws it, so each view can tell whether the bar is drawn on top of it.
      entry[@"owner"] = @(GSAOwnerIdForView(bar));
      [systemBars addObject:entry];
    }
  }
  metrics[@"systemBars"] = systemBars;
  metrics[@"barContainersVisible"] = @(windowBars.containersVisible);
  metrics[@"barItemsKnown"] = @(windowBars.barItemsKnown);

  return metrics;
}

NSString *GSAJSONString(id object)
{
  if (![NSJSONSerialization isValidJSONObject:object]) {
    return @"";
  }
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:NSJSONWritingSortedKeys error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"";
}

#pragma mark - Diagnostics

static NSArray<NSString *> *GSAClassChain(UIView *view)
{
  NSMutableArray<NSString *> *chain = [NSMutableArray new];
  for (Class cls = view.class; cls != nil && cls != UIView.class && chain.count < 6; cls = [cls superclass]) {
    [chain addObject:NSStringFromClass(cls)];
  }
  return chain;
}

/// UIKit views (not React components) that overlap either side column. This is where the probe looks for the
/// vertical bars' real classes and frames.
static void GSACollectEdgeViews(
    UIView *view,
    CGRect leftStrip,
    CGRect rightStrip,
    NSMutableArray<NSDictionary *> *out,
    NSUInteger depth)
{
  if (view.hidden || depth > 256 || out.count >= 400) {
    return;
  }
  CGRect frame = [view convertRect:view.bounds toView:nil];
  // Not `conformsToProtocol:RCTComponentViewProtocol`: React Native adds that protocol to every UIView in a category.
  BOOL isReact = [view isKindOfClass:RCTViewComponentView.class];
  if (!isReact && depth > 0 &&
      (CGRectIntersectsRect(frame, leftStrip) || CGRectIntersectsRect(frame, rightStrip))) {
    [out addObject:@{
      @"classes" : GSAClassChain(view),
      @"frame" : GSARect(frame),
      @"alpha" : GSANumber(view.alpha),
      @"depth" : @(depth),
      @"isBar" : @(GSAIsBarView(view)),
      @"safeAreaInsets" : GSAInsets(view.safeAreaInsets),
    }];
  }
  for (UIView *subview in view.subviews) {
    GSACollectEdgeViews(subview, leftStrip, rightStrip, out, depth + 1);
  }
}

static NSDictionary *GSAViewControllerTree(UIViewController *controller, NSUInteger depth)
{
  NSMutableArray *children = [NSMutableArray new];
  if (depth < 16) {
    for (UIViewController *child in controller.childViewControllers) {
      [children addObject:GSAViewControllerTree(child, depth + 1)];
    }
  }
  NSMutableDictionary *node = [@{
    @"class" : NSStringFromClass(controller.class),
    @"children" : children,
    @"additionalSafeAreaInsets" : GSAInsets(controller.additionalSafeAreaInsets),
  } mutableCopy];
  if (controller.isViewLoaded) {
    node[@"viewFrame"] = GSARect([controller.view convertRect:controller.view.bounds toView:nil]);
    node[@"safeAreaInsets"] = GSAInsets(controller.view.safeAreaInsets);
  }
  if (controller.presentedViewController != nil && controller.presentedViewController.presentingViewController == controller &&
      depth < 16) {
    node[@"presented"] = GSAViewControllerTree(controller.presentedViewController, depth + 1);
  }
  return node;
}

static NSDictionary *GSAWindowDiagnostics(UIWindow *window)
{
  UIWindowScene *scene = window.windowScene;
  UITraitCollection *traits = window.traitCollection;
  NSMutableDictionary *info = [@{
    @"class" : NSStringFromClass(window.class),
    @"isKey" : @(window.isKeyWindow),
    @"hidden" : @(window.hidden),
    @"frame" : GSARect(window.frame),
    @"safeAreaInsets" : GSAInsets(window.safeAreaInsets),
    @"traits" : @{
      @"horizontalSizeClass" : @(traits.horizontalSizeClass),
      @"verticalSizeClass" : @(traits.verticalSizeClass),
      @"layoutDirection" : @(traits.layoutDirection),
      @"verticalBarEdge" : GSAVerticalBarEdgeName(traits) ?: NSNull.null,
    },
  } mutableCopy];

  if (scene != nil) {
    UIStatusBarManager *statusBar = scene.statusBarManager;
    UIInterfaceOrientation orientation = UIInterfaceOrientationUnknown;
    if (@available(iOS 16.0, *)) {
      orientation = scene.effectiveGeometry.interfaceOrientation;
    }
    info[@"scene"] = @{
      @"interfaceOrientation" : @(orientation),
      @"coordinateSpaceBounds" : GSARect(scene.coordinateSpace.bounds),
      @"screenBounds" : GSARect(scene.screen.bounds),
      @"screenScale" : GSANumber(scene.screen.scale),
      @"statusBar" : @{
        @"frame" : GSARect(statusBar.statusBarFrame),
        @"frameInWindow" : GSARect([window convertRect:statusBar.statusBarFrame
                                     fromCoordinateSpace:scene.coordinateSpace]),
        @"hidden" : @(statusBar.isStatusBarHidden),
      },
    };
  }

#if GSA_HAS_IOS_26_SDK
  if (@available(iOS 26.0, *)) {
    info[@"cornerAdaptedInsets"] = @{
      @"vertical" : GSAInsets([window
          edgeInsetsForLayoutRegion:[UIViewLayoutRegion
                                        safeAreaLayoutRegionWithCornerAdaptation:UIViewLayoutRegionAdaptivityAxisVertical]]),
      @"horizontal" : GSAInsets([window
          edgeInsetsForLayoutRegion:[UIViewLayoutRegion safeAreaLayoutRegionWithCornerAdaptation:
                                                            UIViewLayoutRegionAdaptivityAxisHorizontal]]),
    };
  }
#endif

#if GSA_HAS_IOS_27_1_SDK
  if (@available(iOS 27.1, *)) {
    info[@"reservedRegions"] = @{
      @"occlusion" : GSAReservedRegions(window, [UIViewReservedRegionKind occlusionRegionKind], YES),
      @"division" : GSAReservedRegions(window, [UIViewReservedRegionKind divisionRegionKind], YES),
    };
    NSMutableArray *barRegions = [NSMutableArray new];
    CGFloat sideInset = MAX(window.safeAreaInsets.left, window.safeAreaInsets.right);
    for (NSString *edge in @[ @"leading", @"trailing" ]) {
      for (NSNumber *extent in @[ @44, @64, @(sideInset) ]) {
        if (extent.doubleValue <= 0) {
          continue;
        }
        [barRegions addObject:@{
          @"edge" : edge,
          @"extent" : extent,
          @"insets" : GSAInsets(GSABarRegionInsets(window, edge, extent.doubleValue)),
        }];
      }
    }
    info[@"barRegions"] = barRegions;
  }
#endif

  info[@"metrics"] = GSAMetricsForView(window, nil) ?: NSNull.null;
  GSAWindowBars *bars = [GSAWindowBars scanForView:window];
  NSMutableArray *barViews = [NSMutableArray new];
  for (UIView *bar in bars.barViews) {
    [barViews addObject:@{
      @"classes" : GSAClassChain(bar),
      @"frame" : GSARect([bar convertRect:bar.bounds toView:nil]),
      @"visible" : @(GSAIsVisible(bar)),
    }];
  }
  info[@"bars"] = @{
    @"views" : barViews,
    @"containersVisible" : @(bars.containersVisible),
    @"barItemsKnown" : @(bars.barItemsKnown),
  };
  if (window.rootViewController != nil) {
    info[@"viewControllers"] = GSAViewControllerTree(window.rootViewController, 0);
  }

  CGFloat stripWidth = MAX(100, MAX(window.safeAreaInsets.left, window.safeAreaInsets.right));
  CGRect bounds = window.bounds;
  CGRect leftStrip = CGRectMake(0, 0, stripWidth, bounds.size.height);
  CGRect rightStrip = CGRectMake(bounds.size.width - stripWidth, 0, stripWidth, bounds.size.height);
  NSMutableArray *edgeViews = [NSMutableArray new];
  GSACollectEdgeViews(window, leftStrip, rightStrip, edgeViews, 0);
  info[@"viewsNearEdges"] = edgeViews;

  return info;
}

NSDictionary *GSADiagnostics(void)
{
  NSMutableArray *windows = [NSMutableArray new];
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) {
      continue;
    }
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      [windows addObject:GSAWindowDiagnostics(window)];
    }
  }

  struct utsname systemInfo;
  uname(&systemInfo);
  return @{
    @"library" : @"react-native-granular-safe-areas",
    @"device" : @{
      @"machine" : @(systemInfo.machine),
      @"model" : UIDevice.currentDevice.model,
      @"systemVersion" : UIDevice.currentDevice.systemVersion,
    },
    @"sdk" : @{
      @"iphoneOSVersionMaxAllowed" : @(__IPHONE_OS_VERSION_MAX_ALLOWED),
      @"hasIOS27_1SDK" : @(GSA_HAS_IOS_27_1_SDK),
    },
    @"windows" : windows,
  };
}
