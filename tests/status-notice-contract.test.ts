import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("status notice design contract", () => {
  it("exposes semantic tones and stable accessibility behavior", () => {
    const statusNotice = source("src/components/molecules/StatusNotice.tsx");

    expect(statusNotice).toContain("data-slot=\"status-notice\"");
    expect(statusNotice).toContain('tone === "destructive" ? "alert" : "status"');
    expect(statusNotice).toContain("success:");
    expect(statusNotice).toContain("warning:");
    expect(statusNotice).toContain("destructive:");
  });

  it("keeps settings on the shared feedback surface", () => {
    expect(source("src/pages/SettingsPage.tsx")).toContain("<StatusNotice");
    expect(source("src/components/molecules/StatusNotice.tsx")).toContain('data-slot="status-notice"');
  });
});
