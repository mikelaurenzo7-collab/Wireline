/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Plausible analytics, loaded via index.html. Optional — may be absent. */
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void;
  }
}

export {};
