/// <reference types="vite/client" />

declare module '*?worker' {
  const worker: new () => Worker;
  export default worker;
}

import type { ExploreApi } from '@explore/shared';
export type { ExploreApi } from '@explore/shared';

declare global {
  interface Window {
    explore: ExploreApi;
  }
}
