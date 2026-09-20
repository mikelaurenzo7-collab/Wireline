import { defineConfig, type UserConfig } from "vite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import baseConfigFactory from "../vite.config";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig((context) => {
  const base = (
    typeof baseConfigFactory === "function" ? baseConfigFactory(context) : baseConfigFactory
  ) as UserConfig;

  return {
    ...base,
    plugins: [
      ...(base.plugins ?? []),
      {
        name: "botbound-proof-source-identity",
        configureServer(server) {
          server.middlewares.use("/__botbound_proof_identity", (_request, response) => {
            try {
              const identity = readFileSync(
                resolve(repositoryRoot, ".botbound-proof-source-identity.json"),
                "utf8",
              );
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.setHeader("Cache-Control", "no-store");
              response.end(identity);
            } catch {
              response.statusCode = 404;
              response.end("Proof source identity is not active.");
            }
          });
        },
      },
    ],
    server: {
      ...base.server,
      port: 3002,
      strictPort: true,
      // Concurrent launch rendering writes large binary files below brand-work.
      // Ignoring that output estate keeps Windows file locks from killing the
      // exact-source preview watcher during capture.
      watch: {
        ...base.server?.watch,
        ignored: ["**/brand-work/**", "**/apps/botbound-film/out/**"],
      },
      proxy: {
        ...base.server?.proxy,
        // The proof run is credential-free. The local stub simulates signed-out
        // auth and paused billing availability; it is not live vendor evidence.
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
