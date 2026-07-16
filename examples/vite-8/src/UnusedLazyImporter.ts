import { lazy } from 'solid-js';

export const title = 'Counter';

export class UnusedLazyImporter {
  mount() {
    return lazy(() => import('./UnusedLazy'));
  }
}
