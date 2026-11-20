#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// The views that draw app UI other views may have to avoid: UIKit bars, the vertical bar back button, accessories.
/// A region names its view by id, because regions travel through JS as plain numbers. UIKit bars get positive ids here;
/// views created from JS bring their own negative ids. 0 means no owner: system UI, which covers everything.
FOUNDATION_EXTERN NSInteger GSAOwnerIdForView(UIView *view);
FOUNDATION_EXTERN void GSARegisterOwner(NSInteger ownerId, UIView *view);
FOUNDATION_EXTERN void GSAUnregisterOwner(NSInteger ownerId, UIView *view);
FOUNDATION_EXTERN UIView *_Nullable GSAOwnerView(NSInteger ownerId);

/// Whether `view` is drawn on top of `other`: where their branches of the view hierarchy meet, `view`'s comes later
/// (or has the higher `zPosition`, which is how React Native's `zIndex` is applied). A presented sheet or modal is drawn
/// on top of the screen it was presented from, and a view rendered later at the root (a JS overlay) on top of
/// everything rendered before it. A view is never drawn on top of its own ancestors or descendants.
FOUNDATION_EXTERN BOOL GSAIsDrawnAbove(UIView *view, UIView *other);

/// Whether one of the two views contains the other.
FOUNDATION_EXTERN BOOL GSAAreRelated(UIView *view, UIView *other);

/// The root view of the screen `view` is in: the view of the nearest view controller above it.
FOUNDATION_EXTERN UIView *_Nullable GSAScreenView(UIView *view);

/// The transition the screen `view` is in is part of, if one is running. A view controller transition moves screens
/// around, and React Native lays the incoming one out as it goes, so positions are only settled once it's done.
FOUNDATION_EXTERN id<UIViewControllerTransitionCoordinator> _Nullable GSATransitionCoordinator(UIView *view);

NS_ASSUME_NONNULL_END
