import { useCallback, type Ref } from 'react';
import { View, type HostInstance, type ViewProps } from 'react-native';
import { useGranularSafeArea } from './useGranularSafeArea';
import type { GranularSafeAreaOptions } from './types';

export type GranularSafeAreaViewProps = ViewProps &
  GranularSafeAreaOptions & { ref?: Ref<HostInstance> };

/**
 * A `View` that moves its content clear of the OS UI it actually overlaps, and only there. It follows the system UI
 * as it changes: a growing Dynamic Island, bars appearing, growing or shrinking, rotation, folding.
 *
 * Compared with `SafeAreaView`, an element in a free stretch of the iPhone Duo's right column keeps the full width,
 * while one next to the status cluster or a vertical system bar is pushed in by exactly the overlap. On devices
 * without granular metrics it behaves like `SafeAreaView` for the edges it overlaps.
 */
export function GranularSafeAreaView({
  edges,
  avoid,
  spacing,
  mode,
  scrollable,
  style,
  onLayout,
  ref: forwardedRef,
  ...rest
}: GranularSafeAreaViewProps) {
  const { props } = useGranularSafeArea({
    edges,
    avoid,
    spacing,
    mode,
    scrollable,
    style,
    onLayout,
  });
  const measuredRef = props.ref;

  const setRef = useCallback(
    (node: HostInstance | null) => {
      measuredRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [measuredRef, forwardedRef]
  );

  return (
    <View
      {...rest}
      ref={setRef}
      onLayout={props.onLayout}
      style={props.style}
    />
  );
}
