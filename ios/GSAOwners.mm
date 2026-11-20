#import "GSAOwners.h"

static NSMapTable<UIView *, NSNumber *> *GSAIdsByView(void)
{
  static NSMapTable<UIView *, NSNumber *> *table;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    table = [NSMapTable weakToStrongObjectsMapTable];
  });
  return table;
}

static NSMapTable<NSNumber *, UIView *> *GSAViewsById(void)
{
  static NSMapTable<NSNumber *, UIView *> *table;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    table = [NSMapTable strongToWeakObjectsMapTable];
  });
  return table;
}

static NSInteger GSANextOwnerId = 1;

NSInteger GSAOwnerIdForView(UIView *view)
{
  NSNumber *existing = [GSAIdsByView() objectForKey:view];
  if (existing != nil) {
    return existing.integerValue;
  }
  NSInteger ownerId = GSANextOwnerId++;
  [GSAIdsByView() setObject:@(ownerId) forKey:view];
  [GSAViewsById() setObject:view forKey:@(ownerId)];
  return ownerId;
}

void GSARegisterOwner(NSInteger ownerId, UIView *view)
{
  if (ownerId != 0) {
    [GSAViewsById() setObject:view forKey:@(ownerId)];
  }
}

void GSAUnregisterOwner(NSInteger ownerId, UIView *view)
{
  if (ownerId != 0 && [GSAViewsById() objectForKey:@(ownerId)] == view) {
    [GSAViewsById() removeObjectForKey:@(ownerId)];
  }
}

UIView *_Nullable GSAOwnerView(NSInteger ownerId)
{
  return ownerId != 0 ? [GSAViewsById() objectForKey:@(ownerId)] : nil;
}

UIView *_Nullable GSAScreenView(UIView *view)
{
  for (UIView *ancestor = view.superview; ancestor != nil; ancestor = ancestor.superview) {
    if ([ancestor.nextResponder isKindOfClass:UIViewController.class]) {
      return ancestor;
    }
  }
  return nil;
}

id<UIViewControllerTransitionCoordinator> _Nullable GSATransitionCoordinator(UIView *view)
{
  // A child returns its container's coordinator while the container transitions.
  UIView *screen = GSAScreenView(view);
  return screen != nil ? ((UIViewController *)screen.nextResponder).transitionCoordinator : nil;
}

BOOL GSAAreRelated(UIView *view, UIView *other)
{
  return [view isDescendantOfView:other] || [other isDescendantOfView:view];
}

BOOL GSAIsDrawnAbove(UIView *view, UIView *other)
{
  UIWindow *window = view.window;
  if (window == nil || other.window == nil) {
    return NO;
  }
  if (window != other.window) {
    return window.windowLevel > other.window.windowLevel;
  }
  if (GSAAreRelated(view, other)) {
    return NO;
  }
  // The two chains up to the window, and where they meet.
  NSMutableArray<UIView *> *otherChain = [NSMutableArray new];
  for (UIView *current = other; current != nil; current = current.superview) {
    [otherChain addObject:current];
  }
  UIView *below = view;
  for (UIView *current = view.superview; current != nil; below = current, current = current.superview) {
    NSUInteger index = [otherChain indexOfObjectIdenticalTo:current];
    if (index == NSNotFound || index == 0) {
      continue;
    }
    UIView *otherBelow = otherChain[index - 1];
    if (below.layer.zPosition != otherBelow.layer.zPosition) {
      return below.layer.zPosition > otherBelow.layer.zPosition;
    }
    NSArray<UIView *> *siblings = current.subviews;
    return [siblings indexOfObjectIdenticalTo:below] > [siblings indexOfObjectIdenticalTo:otherBelow];
  }
  return NO;
}
