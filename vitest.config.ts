import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "src/lib/audit-routes.test.ts",
      "src/lib/tenant-quotas.test.ts",
      "src/lib/account-deletion.test.ts",
      "src/lib/contact-profile.test.ts",
      "src/lib/crm-service.test.ts",
      "src/lib/fleet-activity.test.ts",
      "src/lib/integrations-registry.test.ts",
      "src/lib/user-journey.test.ts",
      "src/middleware/require-role.test.ts",
      "src/routes/__tests__/account-deletion-routes.test.ts",
      "src/components/admin/__tests__/SubscriptionPanel.test.tsx",
      "src/components/admin/__tests__/SystemPanel.test.tsx",
      "src/components/__tests__/AuthPortal.test.tsx",
      "src/components/__tests__/smoke.test.tsx",
      "src/components/__tests__/AdminSettings.test.tsx",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
