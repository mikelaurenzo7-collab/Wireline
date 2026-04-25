import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "server/**/*.{test,spec}.ts"],
    env: {
      NODE_ENV: "test",
      // Provide minimum env so the server-side env loader doesn't print
      // warnings during the test run.
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.config.*", "**/vitest.setup.ts"],
    },
  },
});

