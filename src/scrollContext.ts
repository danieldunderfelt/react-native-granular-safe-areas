import { createContext, useContext, type Context } from 'react';
import { ScrollView } from 'react-native';
import type { ScrollAxes } from './types';

type ScrollViewContextValue = { horizontal: boolean } | null;

// Every React Native ScrollView (and so FlatList, SectionList, FlashList, ...) provides this. It isn't in the public
// types, and React Native Web doesn't have it.
const ScrollViewContext =
  (ScrollView as unknown as { Context?: Context<ScrollViewContextValue> })
    .Context ?? createContext<ScrollViewContextValue>(null);

const VERTICAL: ScrollAxes = Object.freeze({
  vertical: true,
  horizontal: false,
});
const HORIZONTAL: ScrollAxes = Object.freeze({
  vertical: false,
  horizontal: true,
});

/** Which way the nearest React Native scroll view around the component scrolls, or `null` outside of one. */
export function useScrollViewAxes(): ScrollAxes | null {
  const value = useContext(ScrollViewContext);
  if (!value) return null;
  return value.horizontal ? HORIZONTAL : VERTICAL;
}
