/**
 * Wireline Clear System check: the executable design/product contract.
 *
 * The profit-agent launch story (and its included-number promise) is the
 * active truth; the broader historical guardrails live in focused modules
 * under scripts/clear-system/ so the surface stays comprehensive without one
 * monolithic file:
 *
 *   launch-story            profit-agent metadata, included numbers, claims
 *   design-tokens           Aurora palette + retired-palette sweep
 *   marketing-surfaces      public pages, wire signature, honest positioning
 *   public-typography       shipped weights, platform rendering, readable type
 *   browser-extension       Wireline Command naming, commands, permissions
 *   native-surfaces         Android/iOS tabs, titles, agent language
 *   authenticated-surfaces  routes, Studio canvas, auth flow, Training IA
 *   billing-integrity       Conversation Balance ledger + catalog knowledge
 *   structure-hygiene       CSS foundations, package guards, tombstones
 *   interaction-primitives  controls, menus, dialogs, and shared form semantics
 *
 * Tracked by #718: keep every module free of retired positioning while
 * preserving the full verification breadth.
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

const modules = [
  ["launch story", checkLaunchStory],
  ["design tokens", checkDesignTokens],
  ["marketing surfaces", checkMarketingSurfaces],
  ["public typography", checkPublicTypography],
  ["browser extension", checkBrowserExtension],
  ["native surfaces", checkNativeSurfaces],
  ["authenticated surfaces", checkAuthenticatedSurfaces],
  ["billing integrity", checkBillingIntegrity],
  ["structure hygiene", checkStructureHygiene],
  ["interaction primitives", checkInteractionPrimitives],
];

const context = createCheckContext();
let checkedModules = 0;

for (const [name, run] of modules) {
  const before = context.failures.length;
  run(context);
  checkedModules += 1;
  const added = context.failures.length - before;
  if (added > 0) {
    // Prefix each new failure with its module so a long list stays scannable.
    for (let i = before; i < context.failures.length; i += 1) {
      context.failures[i] = `[${name}] ${context.failures[i]}`;
    }
  }
}

if (context.failures.length) {
  console.error(`Wireline Clear System check failed:\n- ${context.failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Wireline Clear System check passed (${checkedModules} modules)`);
}
