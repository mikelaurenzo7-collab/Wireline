import { defineConfig, type UserConfig } from "vite";

import baseConfigFactory from "../vite.config";

export default defineConfig((context) => {
  const base = (
    typeof baseConfigFactory === "function" ? baseConfigFactory(context) : baseConfigFactory
  ) as UserConfig;

  return {
    ...base,
    server: {
      ...base.server,
      // Concurrent launch rendering writes large binary files below brand-work.
      // Ignoring that output estate keeps Windows file locks from killing the
      // exact-source preview watcher during capture.
      watch: {
        ...base.server?.watch,
        ignored: ["**/brand-work/**", "**/apps/botbound-film/out/**"],
      },
      proxy: {
        ...base.server?.proxy,
        // The proof run is credential-free. A tiny local stub answers only the
        // signed-out auth probes so public routes can settle deterministically.
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
