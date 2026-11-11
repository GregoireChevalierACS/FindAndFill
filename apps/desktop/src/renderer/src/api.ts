import type { ApiFindAndFill } from '../../shared/api.js';

declare global {
  interface Window {
    readonly findAndFill: ApiFindAndFill;
  }
}

/** Accès au processus principal, exposé par le preload. */
export const api = (): ApiFindAndFill => window.findAndFill;
