import { YDocHandles } from './yDoc';

let currentHandles: YDocHandles | null = null;

export const setYDocHandles = (handles: YDocHandles | null) => {
  currentHandles = handles;
};

export const getYDocHandles = () => currentHandles;

