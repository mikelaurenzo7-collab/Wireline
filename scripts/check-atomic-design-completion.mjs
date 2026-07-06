import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new Error(`Missing required Atomic Design file: ${relativePath}`);
  return readFileSync(path, "utf8");
}

function assertIncludes(relativePath, expression, message) {
  if (!expression.test(read(relativePath))) {
    throw new Error(`${relativePath}: ${message}`);
  }
}

function assertExcludes(relativePath, expression, message) {
  if (expression.test(read(relativePath))) {
    throw new Error(`${relativePath}: ${message}`);
  }
}

assertIncludes(
  "src/components/molecules/Card.tsx",
  /\bcva\(/,
  "must expose Card elevations through cva variants.",
);
assertIncludes(
  "src/components/molecules/Card.tsx",
  /"data-slot":\s*"card"/,
  "must expose a stable card surface slot.",
);
assertIncludes(
  "src/components/molecules/Card.tsx",
  /data-slot="card-header"/,
  "must expose stable Card region slots.",
);
assertIncludes(
  "src/components/molecules/index.ts",
  /CardContent/,
  "must export the canonical Card molecule from the public molecules barrel.",
);
assertIncludes(
  "src/components/ui/shadcn/Card.tsx",
  /from "\.\.\/\.\.\/molecules\/Card"/,
  "must route legacy Card imports through the canonical molecule.",
);
assertIncludes(
  "src/components/organisms/index.ts",
  /PageShell/,
  "must retain the canonical PageShell organism boundary.",
);
assertIncludes(
  "src/components/organisms/index.ts",
  /CommandBar/,
  "must retain the canonical CommandBar organism boundary.",
);
assertIncludes(
  "src/pages/ResetPassword.tsx",
  /from "\.\.\/components\/atoms"/,
  "must use canonical atoms for password-reset controls.",
);
assertIncludes(
  "src/pages/ResetPassword.tsx",
  /FormField, StatusNotice/,
  "must use canonical form and feedback molecules for password reset.",
);
assertExcludes(
  "src/pages/ResetPassword.tsx",
  /components\/ui\/shadcn/,
  "must not import compatibility primitives directly.",
);
assertIncludes(
  "src/pages/OnboardingFlow.tsx",
  /from "\.\.\/components\/atoms"/,
  "must use canonical atoms for onboarding controls.",
);
assertIncludes(
  "src/pages/OnboardingFlow.tsx",
  /Card, FormField/,
  "must use canonical Card and FormField molecules for onboarding.",
);
assertExcludes(
  "src/pages/OnboardingFlow.tsx",
  /components\/ui\/shadcn/,
  "must not import compatibility primitives directly.",
);
assertIncludes(
  "src/pages/Developers.tsx",
  /import \{ Button \} from "\.\.\/components\/atoms"/,
  "must use the canonical Button atom for developer portal actions.",
);
assertExcludes(
  "src/pages/Developers.tsx",
  /ShadButton|components\/ui\/shadcn/,
  "must not import compatibility buttons directly.",
);
for (const path of [
  "src/components/layout/TrialBanner.tsx",
  "src/components/layout/EmailVerifyBanner.tsx",
  "src/components/UsageMeter.tsx",
  "src/components/DailyBrief.tsx",
  "src/pages/BillingSettings.tsx",
]) {
  assertIncludes(
    path,
    /from "\.\.\/components\/atoms"|from "\.\/atoms"|from "\.\.\/\.\.\/components\/atoms"/,
    "must use the canonical Button atom.",
  );
  assertExcludes(path, /ShadButton/, "must not import ShadButton compatibility wrapper.");
}
assertExcludes(
  "src/components/ui/shadcn/index.ts",
  /This is the \*\*canonical\*\* UI layer/,
  "must describe shadcn exports as a compatibility layer rather than a second canonical system.",
);

/* PR3: new canonical expectations for token usage in atomic completion checks */
assertIncludes(
  "src/components/molecules/Card.tsx",
  /--wireline-(color|radius)/,
  "Card must derive from semantic wireline tokens",
);
assertIncludes(
  "src/components/molecules/StatusNotice.tsx",
  /--wireline-(color|radius)/,
  "StatusNotice must derive from semantic wireline tokens",
);

console.log("Atomic Design completion checks passed.");
