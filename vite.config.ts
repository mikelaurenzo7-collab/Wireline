import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

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
      alias: {
        "@": path.resolve(__dirname, "."),
        buffer: "buffer",
      },
    },
    optimizeDeps: {
      include: ["buffer"],
    },
    build: {
      sourcemap: false,
      // Keep chunks reasonable — 500 kB uncompressed is a good ceiling
      // before we start caring about a given page's specific imports.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // NOTE: previously bucketed recharts/d3 into vendor-charts, but
            // that caused Vite to emit a hard `import "./vendor-charts.js"`
            // side-effect line into EVERY lazy route chunk (including
            // DashboardHome / CommandBar / ContactProfile / etc.) — so
            // visiting any route fetched the 379KB chart vendor. Letting
            // rollup decide chunking inlines recharts only into the chunks
            // that import it (InsightsView, AdminSettings), keeping it off
            // the critical path everywhere else.
            // Vapi browser SDK — only used in DashboardHome live-call widget.
            if (id.includes("node_modules/@vapi-ai")) {
              return "vendor-vapi";
            }
            // Motion (Framer Motion fork) — animation library used everywhere
            // but kept separate so it can be cached independently.
            if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion")) {
              return "vendor-motion";
            }
            // Lucide icon set — large icon sprite, cache independently.
            if (id.includes("node_modules/lucide-react")) {
              return "vendor-lucide";
            }
            // Core React runtime — smallest possible initial payload.
            // Use exact package boundaries to avoid accidentally bucketing
            // react-router-dom or other react-* packages here.
            if (/node_modules\/(react|react-dom)\//.test(id)) {
              return "vendor-react";
            }
          },
        },
      },
    },
    server: {
      hmr: true,
      // In local dev, proxy /api/* to the Express server. Honor PORT so a
      // developer running the API on a non-default port (e.g. when 3000 is
      // taken) doesn't have to also edit vite.config.ts.
      proxy: {
        "/api": {
          target: `http://localhost:${env.PORT || 3000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
