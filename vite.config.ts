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
      ...(process.env.VISUALIZE ? [visualizer({ open: false, filename: "stats.html", gzipSize: true })] : []),
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
      sourcemap: "hidden",
      target: "es2022",
      cssTarget: "chrome111",
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // @vapi-ai/web is now loaded through a route-level dynamic import.
            // Let Rollup own that async chunk; forcing the old vendor name emits
            // an empty artifact and obscures whether the lazy boundary works.
            if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion")) return "vendor-motion";
            if (id.includes("node_modules/lucide-react")) return "vendor-lucide";
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
