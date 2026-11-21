import { tsImport } from "tsx/esm/api";
import { readSharedWorkCatalog } from "./lib/stripe-launch-readiness.mjs";

const { usageCheckoutConfigured } = await tsImport(
  "../src/lib/usage-billing-config.ts",
  import.meta.url,
);
const report = await readSharedWorkCatalog({
  key: process.env.STRIPE_SECRET_KEY?.trim() || "",
  env: process.env,
  usageCheckoutConfigured,
});
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 1;
