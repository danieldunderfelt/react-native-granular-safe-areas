#import "GSAAnchorView.h"

#import <react/renderer/components/GranularSafeAreasSpec/ComponentDescriptors.h>
#import <react/renderer/components/GranularSafeAreasSpec/EventEmitters.h>
#import <react/renderer/components/GranularSafeAreasSpec/Props.h>
#import <react/renderer/components/GranularSafeAreasSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface GSAAnchorView () <RCTGranularSafeAreaAnchorViewProtocol>
@end

@implementation GSAAnchorView {
  /// What JS currently believes. JS assumes "in a window" until told otherwise, so the first frame is already right.
  BOOL _reportedInWindow;
  BOOL _checkScheduled;
}

// Keeps the class from being stripped: it is only looked up by name. See react-native#37274.
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GranularSafeAreaAnchorComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const GranularSafeAreaAnchorProps>();
    _props = defaultProps;
    _reportedInWindow = YES;
    self.userInteractionEnabled = NO;
  }
  return self;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  [self reportIfChanged];
}

- (void)didMoveToSuperview
{
  [super didMoveToSuperview];
  // Mounted into a screen that isn't in a window, e.g. a tab that was never selected: UIKit doesn't call
  // -didMoveToWindow then, because the window didn't change. Check once things have settled.
  [self scheduleCheck];
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];
  [self scheduleCheck];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  _reportedInWindow = YES;
}

- (void)scheduleCheck
{
  if (_checkScheduled) {
    return;
  }
  _checkScheduled = YES;
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof(self) strongSelf = weakSelf;
    if (strongSelf != nil) {
      strongSelf->_checkScheduled = NO;
      [strongSelf reportIfChanged];
    }
  });
}

- (void)reportIfChanged
{
  BOOL inWindow = self.window != nil;
  if (inWindow == _reportedInWindow || _eventEmitter == nullptr) {
    return;
  }
  _reportedInWindow = inWindow;
  std::static_pointer_cast<const GranularSafeAreaAnchorEventEmitter>(_eventEmitter)
      ->onWindowChange({.inWindow = (bool)inWindow});
}

@end
