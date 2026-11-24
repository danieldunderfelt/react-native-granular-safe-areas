import { createContext } from 'react';
import type { GranularSafeAreaStore } from './store';

/** Holds the nearest provider's store. The value never changes, so it never re-renders consumers by itself. */
export const GranularSafeAreaContext =
  createContext<GranularSafeAreaStore | null>(null);
GranularSafeAreaContext.displayName = 'GranularSafeAreaContext';
