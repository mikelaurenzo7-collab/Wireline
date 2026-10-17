import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_REGISTRY } from "../src/lib/env-validator";
import {
  hasPreviewSpendAuthority,
  isolatedPreviewInMemoryRateLimitAllowed,
} from "../src/lib/preview-spend-policy";

const preview = {
  VERCEL_ENV: "preview",
  WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: "true",
  WIRELINE_PREVIEW_DATABASE_ISOLATED: "true",
  WIRELINE_LAUNCH_DEMO_MODE: "true",
};

describe("optional voice provider environment boundaries", () => {
  it.each([
    ["BOTBOUND_ELEVENLABS_VOICE_ENABLED", "false", ["TRUE", "1", " true "]],
    [
      "BOTBOUND_ELEVENLABS_VOICE_API_KEY",
      "dedicated-test-key",
      ["bad key", "key\n", "x".repeat(513)],
    ],
    [
      "BOTBOUND_ELEVENLABS_WORKSPACE_ID",
      "workspace_123-abc",
      ["name@example.com", "workspace/id", "x".repeat(129)],
    ],
  ] as const)("validates %s without making it mandatory", (name, good, bad) => {
    const entry = ENV_REGISTRY.find((item) => item.name === name);
    expect(entry).toBeDefined();
    expect(entry?.required).toBe(false);
    expect(entry?.validate?.(good)).toBe(true);
    for (const value of bad) expect(entry?.validate?.(value)).toBe(false);
  });

  it.each(["BOTBOUND_ELEVENLABS_VOICE_API_KEY", "VOICE_ENGINE_SERVICE_TOKEN"])(
    "does not treat a preview with %s as provider-free even while its feature is disabled",
    (name) => {
      const env = {
        ...preview,
        BOTBOUND_ELEVENLABS_VOICE_ENABLED: "false",
        [name]: "dedicated-key",
      };
      expect(hasPreviewSpendAuthority(env)).toBe(true);
      expect(isolatedPreviewInMemoryRateLimitAllowed(env)).toBe(false);
      const result = spawnSync(
        process.execPath,
        [resolve(process.cwd(), "scripts/check-deployment-boundaries.mjs")],
        { encoding: "utf8", env: { PATH: process.env.PATH, ...env } },
      );
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stdout + result.stderr).toContain(name);
    },
  );
});
