import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const readRepoFile = (path: string) => readFileSync(join(repoRoot, path), "utf8");

describe("Wingman iOS App Store readiness", () => {
  it("ships with the production API origin, not a placeholder backend", () => {
    const config = readRepoFile("ios/Wingman/Networking/WingmanConfig.swift");

    expect(config).toContain('URL(string: "https://trywireline.com")');
    expect(config).not.toContain("wireline.example");
  });

  it("declares privacy strings for every iOS system capability used by the app", () => {
    const plist = readRepoFile("ios/Wingman/Info.plist");

    expect(plist).toContain("NSMicrophoneUsageDescription");
    expect(plist).toContain("NSCalendarsUsageDescription");
    expect(plist).toContain("NSCalendarsWriteOnlyAccessUsageDescription");
    expect(plist).toContain("NSSiriUsageDescription");
  });

  it("keeps CarPlay signing gated until Apple grants the communication entitlement", () => {
    const entitlements = readRepoFile("ios/Wingman/Wingman.entitlements");
    const project = readRepoFile("ios/project.yml");

    expect(entitlements).not.toMatch(
      /^\s*<key>com\.apple\.developer\.carplay-communication<\/key>/m,
    );
    expect(project).toContain("com.apple.developer.carplay-communication");
    expect(project).toContain("must be granted by Apple before it can be signed");
  });
});
