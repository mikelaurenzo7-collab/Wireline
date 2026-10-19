import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({ fetchWithTimeout: vi.fn() }));

import {
  VOICE_SAMPLE_URL,
  clearVoiceSampleCache,
  isVoiceSampleAvailable,
  synthesizeVoiceSample,
  voiceSampleLine,
} from "../src/lib/voice/voice-sample";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  clearVoiceSampleCache();
});

describe("voice samples", () => {
  it("speaks a short greeting as the Bot, with unsafe characters removed", () => {
    expect(voiceSampleLine("Front Desk")).toBe(
      "Hi, thanks for calling. This is Front Desk. How can I help you today?",
    );
    expect(voiceSampleLine("<script>")).toContain("This is script.");
    expect(voiceSampleLine("   ")).toContain("This is your Bot.");
  });

  it("requests the mapped phone voice once and serves repeats from cache", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    ) as never;
    const first = await synthesizeVoiceSample("eve", "Ava", fetchImpl);
    const second = await synthesizeVoiceSample("eve", "Ava", fetchImpl);
    expect([...first]).toEqual([1, 2, 3]);
    expect(second).toBe(first);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(VOICE_SAMPLE_URL);
    expect(JSON.parse(String(calls[0][1].body))).toMatchObject({
      voice_id: "eve",
      language: "en",
      output_format: { codec: "mp3" },
    });
  });

  it("fails without caching when the provider refuses or the key is missing", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const refused = vi.fn(async () => new Response("no", { status: 429 })) as never;
    await expect(synthesizeVoiceSample("rex", "Ava", refused)).rejects.toThrow("HTTP 429");
    vi.stubEnv("XAI_API_KEY", "");
    expect(isVoiceSampleAvailable()).toBe(false);
    await expect(synthesizeVoiceSample("rex", "Ava", refused)).rejects.toThrow("not configured");
  });

  it("is owner-scoped, rate limited, and plays from each voice card", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toMatch(
      /"\/api\/agent-config\/:id\/voice\/sample",\s*authenticateUser,\s*agentMutationRateLimit/,
    );
    expect(routes).toContain("eq(schema.agents.userId, req.user.id)");
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(picker).toContain("/voice/sample?voice=");
    expect(picker).toContain("Tap play to hear one as callers will.");
    expect(picker).not.toMatch(/Grok|xAI/);
  });
});
