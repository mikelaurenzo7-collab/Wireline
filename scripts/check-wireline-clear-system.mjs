/**
 * BotBound Clear System check: executable product/design contract.
 *
 * The script filename remains `check-wireline-clear-system.mjs` as a stable
 * package-script compatibility path. Customer-facing identity is BotBound.
 */
import { createCheckContext } from "./clear-system/context.mjs";
import { checkLaunchStory } from "./clear-system/launch-story.mjs";
import { checkDesignTokens } from "./clear-system/design-tokens.mjs";
import { checkMarketingSurfaces } from "./clear-system/marketing-surfaces.mjs";
import { checkPublicTypography } from "./clear-system/public-typography.mjs";
import { checkBrowserExtension } from "./clear-system/browser-extension.mjs";
import { checkNativeSurfaces } from "./clear-system/native-surfaces.mjs";
import { checkAuthenticatedSurfaces } from "./clear-system/authenticated-surfaces.mjs";
import { checkBillingIntegrity } from "./clear-system/billing-integrity.mjs";
import { checkStructureHygiene } from "./clear-system/structure-hygiene.mjs";
import { checkInteractionPrimitives } from "./clear-system/interaction-primitives.mjs";

const modules = [["launch story", checkLaunchStory], ["design tokens", checkDesignTokens], ["marketing surfaces", checkMarketingSurfaces], ["public typography", checkPublicTypography], ["browser extension", checkBrowserExtension], ["native surfaces", checkNativeSurfaces], ["authenticated surfaces", checkAuthenticatedSurfaces], ["billing integrity", checkBillingIntegrity], ["structure hygiene", checkStructureHygiene], ["interaction primitives", checkInteractionPrimitives]];
const context = createCheckContext();
let checkedModules = 0;
for (const [name, run] of modules) {
  const before = context.failures.length;
  run(context);
  checkedModules += 1;
  for (let i = before; i < context.failures.length; i += 1) context.failures[i] = `[${name}] ${context.failures[i]}`;
}
if (context.failures.length) {
  console.error(`BotBound Clear System check failed:\n- ${context.failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`BotBound Clear System check passed (${checkedModules} modules)`);
}
