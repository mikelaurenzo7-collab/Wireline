import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

const sourceRoot = path.resolve(__dirname, "src");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(process.env.VISUALIZE
        ? [visualizer({ open: false, filename: "stats.html", gzipSize: true })]
        : []),
    ],
    resolve: {
      alias: [
        { find: "@/src", replacement: sourceRoot },
        { find: "@", replacement: sourceRoot },
        { find: "buffer", replacement: "buffer" },
      ],
    },
    optimizeDeps: {
      include: ["buffer"],
      esbuildOptions: { target: "es2022" },
    },
    build: {
      // No client sourcemaps. "hidden" still WROTE all 159 maps (8.5 MB) into
      // dist/assets and only suppressed the //# sourceMappingURL comment, and
      // vercel.json's SPA rewrite excludes assets/ — so every map stayed
      // fetchable at a guessable /assets/<chunk>.js.map, publishing the whole
      // first-party client source.
      //
      // Nothing consumed them: there is no @sentry/* dependency and no
      // client-side error reporting at all (error-reporter.ts is a
      // server-only custom Sentry transport, and the browser SDK was removed
      // pre-launch — see src/lib/sentry.ts). If client error reporting is ever
      // added, restore "hidden" AND upload the maps to the reporter instead of
      // serving them from the CDN.
      sourcemap: false,
      target: "es2022",
      cssTarget: "chrome111",
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // @vapi-ai/web is now loaded through a route-level dynamic import.
            // Let Rollup own that async chunk; forcing the old vendor name emits
            // an empty artifact and obscures whether the lazy boundary works.
            if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion"))
              return "vendor-motion";
            // lucide-react is deliberately NOT forced into a vendor chunk. It
            // ships one ESM module per icon, so Rollup places each icon in the
            // chunk that uses it. Naming a shared chunk instead collapsed all
            // ~160 icons into one artifact that index.html modulepreloads, so
            // the marketing homepage — which renders 22 of them — eagerly
            // fetched every dashboard-only icon. Same reasoning as @vapi-ai/web
            // above.
            if (/node_modules\/(react|react-dom)\//.test(id)) return "vendor-react";
          },
        },
      },
    },
    server: {
      hmr: true,
      proxy: {
        "/api": {
          target: `http://localhost:${env.PORT || 3000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
