---
to: stores/hooks.ts
---
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './store';

/**
 * Typed hooks.
 *
 * Always import these rather than the react-redux originals: the untyped `useSelector` gives
 * `state: unknown`, so every selector needs a cast and a wrong field name compiles fine.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
