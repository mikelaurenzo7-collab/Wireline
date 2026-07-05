import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice catalog", () => {
  it("exposes multi-provider voice pools for create and studio flows", () => {
    const catalog = read("src/lib/voice-catalog.ts");
    expect(catalog).toContain("WIRELINE_LIVE_VOICES");
    expect(catalog).toContain("VAPI_CURATED_VOICES");
    expect(catalog).toContain("playVoicePreview");
    expect(read("src/components/create-agent/VoicePickerField.tsx")).toContain("/api/voices");
    expect(read("src/routes/voices-routes.ts")).toContain("providers:");
  });
});
