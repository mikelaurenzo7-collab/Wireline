import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const nestedSurfaces = [
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/About.tsx",
  "src/components/AuthPortal.tsx",
  "src/components/StudioWorkspaceV2.tsx",
  "src/components/AgentActionEngine.tsx",
  "src/components/layout/MarketingPageFrame.tsx",
] as const;

describe("safe-area spacing ownership", () => {
  it("keeps safe-area padding on the outer application frame only", () => {
    expect(read("src/App.tsx")).toContain(
      "wl-ui-caps w-full max-w-[100vw] overflow-x-hidden safe-area-insets",
    );
    expect(read("src/styles/foundation.css")).toContain(".safe-area-insets {");

    for (const path of nestedSurfaces) {
      expect(read(path), path).not.toContain("safe-area-insets");
    }
  });

  it("preserves the authored header, form, loading, and tool padding", () => {
    expect(read("src/pages/Features.tsx")).toContain('className="pt-16"');
    expect(read("src/pages/Pricing.tsx")).toContain('className="pt-16"');
    expect(read("src/pages/About.tsx")).toContain('mainClassName="!px-0 pb-0 pt-16"');
    const authPortal = read("src/components/AuthPortal.tsx");
    expect(authPortal).toContain(
      "wl-auth-form-panel flex min-h-[100dvh] items-center justify-center px-4 sm:px-6",
    );
    expect(authPortal).toContain('compact ? "py-6 sm:py-6" : "py-8 sm:py-12"');
    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain(
      "flex min-h-[55vh] flex-col bg-background px-4 py-8 sm:px-6",
    );
    expect(read("src/components/AgentActionEngine.tsx")).toContain(
      "h-full flex flex-col p-4 md:p-6 overflow-hidden",
    );
  });
});
