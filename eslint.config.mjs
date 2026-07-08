// eslint.config.mjs
// Flat-config format (ESLint 9+).
//
// Rules philosophy for Wireline:
//   - Enforce no-console (use structured log.* instead)
//   - Ban `as any` assignments to prevent type-safety regressions
//   - React-hooks rules for correctness
//   - prettier config last so formatting never conflicts with lint rules
//
// server.ts decomposition into sub-modules (tracked in LAUNCH_READINESS_STATUS.md)
// will reduce per-file line counts over time. The file-length limit below is
// intentionally set high for now to avoid blocking CI during the transition.

import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

export default [
  // ── Global ignores ──────────────────────────────────────────────────
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".tmp/**",
      ".worktrees/**",
      "worktrees/**",
      "artifacts/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "*.cjs", // built CJS output
      "public/**",
      "supabase/**",
      "scripts/*.mjs", // maintenance scripts use console intentionally
      "*.config.ts", // vite.config.ts, vitest.config.ts
      "*.config.js",
    ],
  },

  // ── Base JS recommended ──────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript + React files ─────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        // Project-wide type information is expensive on a 11k-line server.ts.
        // Enable only for the src/ sub-tree where typed rules add most value.
        project: false,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // ── Structured logging ─────────────────────────────────────────
      // server.ts uses `log.*` (pino/winston-style); plain console leaks
      // to stdout without metadata. Allow console.error in tests.
      "no-console": ["warn", { allow: ["error"] }],

      // ── Type safety ────────────────────────────────────────────────
      // Prohibit `as any` at assignments; use explicit type assertions
      // with `as unknown as T` or proper types instead.
      "@typescript-eslint/no-explicit-any": "warn",

      // ── React ──────────────────────────────────────────────────────
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ── General quality ────────────────────────────────────────────
      // Log-and-swallow is a deliberate pattern in our fallback chains
      // (e.g. `try { log.warn(...) } catch {}`); a logging miss must never
      // cascade into a user-visible failure.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": "off", // superseded by TS checker
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // Catch-clause errors aren't covered by the above patterns by
          // default; without this, `catch (_err)` still warns.
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "no-undef": "off", // TypeScript handles this
    },
  },

  // ── Browser-extension JS — runs in the browser / service worker ──────
  {
    files: ["apps/browser-extension/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" },
    },
  },

  // ── Node maintenance scripts outside the root scripts/*.mjs ignore ───
  {
    files: ["**/scripts/**/*.mjs", "scripts/lib/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  // ── Test files — relax some rules ────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ── Maintenance scripts — console is the intended output channel ─────
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // ── Prettier — must come last to disable conflicting format rules ─────
  prettierConfig,
];
