import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Sentry source-map upload only runs when SENTRY_AUTH_TOKEN is set in
  // the deploy environment. Without it the plugin no-ops, so dev/local
  // builds stay free of network calls.
  const sentryEnabled = !!env.SENTRY_AUTH_TOKEN && !!env.SENTRY_ORG && !!env.SENTRY_PROJECT;

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(sentryEnabled
        ? [sentryVitePlugin({
            authToken: env.SENTRY_AUTH_TOKEN,
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            release: { name: env.VERCEL_GIT_COMMIT_SHA || undefined },
            // Sourcemaps are deleted from dist/ after upload to avoid
            // shipping them publicly.
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            telemetry: false,
          })]
        : []),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Sourcemaps required for Sentry to symbolicate prod errors. They
      // are uploaded then stripped from the dist/ output above.
      sourcemap: sentryEnabled ? true : false,
      // Keep chunks reasonable — 500 kB uncompressed is a good ceiling
      // before we start caring about a given page's specific imports.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Heavy chart library — only loaded by Insights + Dashboard views.
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
              return 'vendor-charts';
            }
            // Vapi browser SDK — only used in DashboardHome live-call widget.
            if (id.includes('node_modules/@vapi-ai')) {
              return 'vendor-vapi';
            }
            // Motion (Framer Motion fork) — animation library used everywhere
            // but kept separate so it can be cached independently.
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            // Lucide icon set — large icon sprite, cache independently.
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide';
            }
            // Core React runtime — smallest possible initial payload.
            // Use exact package boundaries to avoid accidentally bucketing
            // react-router-dom or other react-* packages here.
            if (/node_modules\/(react|react-dom)\//.test(id)) {
              return 'vendor-react';
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
        '/api': {
          target: `http://localhost:${env.PORT || 3000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
