import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    throw new Error(`Missing required design-system file: ${relativePath}`);
  }

  return readFileSync(path, "utf8");
}

function assertIncludes(relativePath, expression, message) {
  const source = read(relativePath);
  if (!expression.test(source)) {
    throw new Error(`${relativePath}: ${message}`);
  }
}

function assertExcludes(relativePath, expression, message) {
  const source = read(relativePath);
  if (expression.test(source)) {
    throw new Error(`${relativePath}: ${message}`);
  }
}

const canonicalAtoms = [
  "src/components/atoms/Button.tsx",
  "src/components/atoms/Badge.tsx",
  "src/components/atoms/Input.tsx",
  "src/components/atoms/NativeSelect.tsx",
  "src/components/atoms/Skeleton.tsx",
  "src/components/atoms/Textarea.tsx",
  "src/components/atoms/EmptyState.tsx",
  "src/components/atoms/Toast.tsx",
  "src/components/atoms/HelpTooltip.tsx",
];

for (const atom of canonicalAtoms) {
  assertIncludes(atom, /\bcva\(/, "must expose styling through cva variants.");
  assertIncludes(atom, /data-slot=/, "must expose a stable design-system slot.");
}

assertIncludes(
  "src/components/ui/shadcn/ShadButton.tsx",
  /from "\.\.\/\.\.\/atoms\/Button"/,
  "must remain a compatibility re-export of the canonical Button atom.",
);
assertIncludes(
  "src/components/ui/shadcn/Input.tsx",
  /from "\.\.\/\.\.\/atoms\/Input"/,
  "must remain a compatibility re-export of the canonical Input atom.",
);
assertIncludes(
  "src/components/ui/shadcn/Badge.tsx",
  /from "\.\.\/\.\.\/atoms\/Badge"/,
  "must route legacy badge calls through the canonical Badge atom.",
);
assertIncludes(
  "src/components/ui/shadcn/Skeleton.tsx",
  /from "\.\.\/\.\.\/atoms\/Skeleton"/,
  "must route legacy skeleton calls through the canonical Skeleton atom.",
);
assertIncludes(
  "src/components/ui/shadcn/Textarea.tsx",
  /from "\.\.\/\.\.\/atoms\/Textarea"/,
  "must route legacy textarea calls through the canonical Textarea atom.",
);
assertIncludes(
  "src/components/atoms/HelpTooltip.tsx",
  /export const helpTooltipVariants/,
  "must expose the tooltip variants named by the atom barrel.",
);
assertIncludes(
  "src/components/atoms/index.ts",
  /helpTooltipVariants/,
  "must re-export the canonical tooltip variant symbol.",
);
assertIncludes(
  "vite.config.ts",
  /const sourceRoot = path\.resolve\(__dirname, "src"\)/,
  "must resolve source-root aliases from src/.",
);
assertIncludes(
  "tsconfig.json",
  /"@\/\*": \["\.\/src\/\*"\]/,
  "must align TypeScript aliases with the Vite source root.",
);
assertIncludes(
  "src/styles/foundation.css",
  /--wl-success-surface:/,
  "must provide semantic success surface tokens.",
);
assertIncludes(
  "src/styles/foundation.css",
  /--wl-warning-surface:/,
  "must provide semantic warning surface tokens.",
);
assertIncludes(
  "src/styles/foundation.css",
  /--wl-error-surface:/,
  "must provide semantic error surface tokens.",
);
assertIncludes(
  "src/components/atoms/Skeleton.tsx",
  /surface: "rounded-\[var\(--radius-lg\)\]"/,
  "must provide a rounded surface-loading shape.",
);
assertIncludes(
  "src/pages/AgentsPage.tsx",
  /MetricCard/,
  "must adopt shared metric cards for roster summaries.",
);
assertIncludes(
  "src/components/EmailInbox.tsx",
  /SearchField/,
  "must adopt shared search field behavior for the conversation list.",
);
assertIncludes(
  "src/pages/AgentStudioHome.tsx",
  /FormField/,
  "must compose the create-agent dialog from canonical form fields.",
);
assertIncludes(
  "src/pages/AgentStudioHome.tsx",
  /NativeSelect/,
  "must use native select semantics for simple create-agent role choice.",
);
assertExcludes(
  "src/components/atoms/Badge.tsx",
  /(emerald|amber)-\d+/,
  "must consume semantic feedback tokens instead of raw palette variants.",
);

console.log("Design-system contract checks passed.");
