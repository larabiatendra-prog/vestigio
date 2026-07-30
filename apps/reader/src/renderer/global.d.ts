import type { ApiVestigio } from '../preload/index';

declare global {
  interface Window {
    vestigio: ApiVestigio;
  }
}

export {};
