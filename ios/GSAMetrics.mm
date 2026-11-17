#import "GSAMetrics.h"

#import <React/RCTComponentViewProtocol.h>
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

/// The status bar frame in `view`'s coordinates, or nil when it's hidden.
static NSValue *_Nullable GSAStatusBarFrame(UIView *view)
{
  UIWindowScene *scene = GSAWindowOf(view).windowScene;
  UIStatusBarManager *manager = scene.statusBarManager;
  if (manager == nil || manager.isStatusBarHidden || CGRectIsEmpty(manager.statusBarFrame)) {
    return nil;
  }
  return [NSValue valueWithCGRect:[view convertRect:manager.statusBarFrame fromCoordinateSpace:scene.coordinateSpace]];
}

/// Standard UIKit bars, plus private vertical bar containers matched by name. The Phase 0 probe output decides
/// whether the name match is needed; see `viewsNearEdges` in the diagnostics.
static BOOL GSAIsBarView(UIView *view)
{
  if ([view isKindOfClass:UITabBar.class] || [view isKindOfClass:UIToolbar.class] ||
      [view isKindOfClass:UINavigationBar.class]) {
    return YES;
  }
  NSString *name = NSStringFromClass(view.class);
  return [name hasPrefix:@"_UI"] && [name rangeOfString:@"VerticalBar"].location != NSNotFound;
}

/// The visible bars in `view`'s subtree. Bars are leaves: their insides aren't scanned.
static void GSACollectBars(UIView *view, NSMutableArray<UIView *> *bars, NSUInteger depth)
{
  if (view.hidden || view.alpha < 0.01 || depth > 256) {
    return;
  }
  if (GSAIsBarView(view)) {
    [bars addObject:view];
    return;
  }
  for (UIView *subview in view.subviews) {
    GSACollectBars(subview, bars, depth + 1);
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

/// The top of the view controller hierarchy `view` is presented in.
static UIViewController *_Nullable GSAPresentationRoot(UIView *view)
{
  if ([view isKindOfClass:UIWindow.class]) {
    return ((UIWindow *)view).rootViewController;
  }
  UIResponder *responder = view;
  while (responder != nil && ![responder isKindOfClass:UIViewController.class]) {
    responder = responder.nextResponder;
  }
  UIViewController *controller = (UIViewController *)responder;
  while (controller.parentViewController != nil) {
    controller = controller.parentViewController;
  }
  return controller ?: view.window.rootViewController;
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

- (instancetype)initWithBarViews:(NSArray<UIView *> *)barViews containersVisible:(BOOL)containersVisible
{
  if (self = [super init]) {
    _barViews = barViews;
    _containersVisible = containersVisible;
  }
  return self;
}

+ (instancetype)scanForView:(UIView *)view
{
  UIViewController *root = GSAPresentationRoot(view);
  UIView *scanRoot = root.viewIfLoaded ?: GSAWindowOf(view);
  NSMutableArray<UIView *> *bars = [NSMutableArray new];
  if (scanRoot != nil) {
    GSACollectBars(scanRoot, bars, 0);
  }
  BOOL containersVisible = root != nil && GSAHasVisibleBarContainer(root, 0);
  return [[self alloc] initWithBarViews:bars containersVisible:containersVisible];
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
    @"reservedRegionsSupported" : @NO,
  } mutableCopy];

  NSValue *statusBar = GSAStatusBarFrame(view);
  if (statusBar != nil) {
    metrics[@"statusBar"] = GSARect(statusBar.CGRectValue);
  }

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
      [systemBars addObject:GSARect([view convertRect:bar.bounds fromView:bar])];
    }
  }
  metrics[@"systemBars"] = systemBars;
  metrics[@"barContainersVisible"] = @(windowBars.containersVisible);

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
  BOOL isReact = [view conformsToProtocol:@protocol(RCTComponentViewProtocol)];
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
