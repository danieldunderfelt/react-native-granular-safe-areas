#import "GSAModule.h"

#import "GSAMetrics.h"
#import "GSAWindowObserver.h"

#import <React/RCTUtils.h>

@implementation GSAModule

+ (NSString *)moduleName
{
  return @"GranularSafeAreas";
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

// UIKit work: run the promise methods on the main queue.
- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (facebook::react::ModuleConstants<JS::NativeGranularSafeAreas::Constants>)constantsToExport
{
  return [self getConstants];
}

- (facebook::react::ModuleConstants<JS::NativeGranularSafeAreas::Constants>)getConstants
{
  // Same approach as react-native-safe-area-context's initialWindowMetrics: read the key window synchronously so the
  // first frame is laid out with real regions.
  __block NSString *json = @"";
  RCTUnsafeExecuteOnMainQueueSync(^{
    UIWindow *window = GSAAppWindow();
    NSDictionary *metrics = window != nil ? GSAMetricsForView(window, nil) : nil;
    if (metrics != nil) {
      json = GSAJSONString(metrics);
    }
  });
  return facebook::react::typedConstants<JS::NativeGranularSafeAreas::Constants>({.initialWindowMetrics = json});
}

- (void)getDiagnostics:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  resolve(GSAJSONString(GSADiagnostics()));
}

- (void)observeWindow
{
  __weak __typeof(self) weakSelf = self;
  [[GSAWindowObserver shared] startWithHandler:^(NSString *payload) {
    [weakSelf emitOnWindowMetricsChange:payload];
  }];
}

- (void)refreshWindow
{
  [[GSAWindowObserver shared] refresh];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeGranularSafeAreasSpecJSI>(params);
}

@end
