/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- module augmentation for vite
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
