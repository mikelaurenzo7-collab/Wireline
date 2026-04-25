import "@testing-library/jest-dom/vitest";

// Provide a stable `import.meta.env` shape for components that read Vite env
// variables at module load. Tests should never hit real services.
const VITE_ENV_DEFAULTS = {
  VITE_SUPABASE_URL: "https://test.supabase.co",
  VITE_SUPABASE_ANON_KEY: "test-anon-key",
  VITE_VAPI_PUBLIC_KEY: "test-vapi-key",
};

for (const [k, v] of Object.entries(VITE_ENV_DEFAULTS)) {
  if (!(import.meta as any).env?.[k]) {
    (import.meta as any).env = { ...(import.meta as any).env, [k]: v };
  }
}
