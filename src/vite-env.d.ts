/// <reference types="vite/client" />

// Plausible Analytics is loaded via a script tag in index.html, so it appears
// as a global on `window` at runtime with no module import. Declare it here so
// TypeScript knows the shape everywhere it's used (main.tsx error reporting,
// onboarding-errors.ts event tracking).
declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string> }) => void;
  }
}

export {};
