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

const canonicalAtoms = [
  "src/components/atoms/Button.tsx",
  "src/components/atoms/Badge.tsx",
  "src/components/atoms/Input.tsx",
  "src/components/atoms/Skeleton.tsx",
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

console.log("Design-system contract checks passed.");
