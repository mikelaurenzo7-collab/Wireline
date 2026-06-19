/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    /** Plausible analytics, loaded via index.html. Optional — may be absent. */
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void;
  }
}

export {};
