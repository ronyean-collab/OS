import type { ContinuityDesktopApi } from "../../../electron/preload/index";

declare global {
  interface Window {
    /** Exposed by electron/preload when the preload script loads successfully. */
    continuity?: ContinuityDesktopApi;
  }
}

export {};
