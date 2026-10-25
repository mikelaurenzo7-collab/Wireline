import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptUrl = pathToFileURL(resolve("scripts/elevenlabs-runtime-check.mts")).href;
const secret = "test-key-never-print";
const account = {
  workspace_id: "workspace-private",
  email: "private@example.invalid",
  subscription: {
    tier: "creator",
    can_use_instant_voice_cloning: true,
    voice_limit: 30,
    voice_slots_used: 2,
    character_limit: 100_000,
    character_count: 12_345,
  },
};

function runCheck(
  options: {
    response?: unknown;
    status?: number;
    workspace?: string;
    missingKey?: boolean;
    rejectRequest?: boolean;
  } = {},
) {
  const source = `
    import assert from "node:assert/strict";
    let requests = 0;
    globalThis.fetch = async (url, init) => {
      requests += 1;
      assert.equal(requests, 1);
      assert.equal(url, "https://api.elevenlabs.io/v1/user");
      assert.equal(init.method, "GET");
      assert.equal(init.headers["xi-api-key"], ${JSON.stringify(secret)});
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
      if (${Boolean(options.rejectRequest)}) throw new Error(${JSON.stringify(secret)});
      return new Response(${JSON.stringify(JSON.stringify(options.response ?? account))}, {
        status: ${options.status ?? 200},
        headers: { "content-type": "application/json" },
      });
    };
    await import(${JSON.stringify(scriptUrl)});
  `;
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      ELEVENLABS_API_KEY: options.missingKey ? "" : secret,
      BOTBOUND_ELEVENLABS_WORKSPACE_ID: options.workspace ?? "",
    },
  });
}

describe("ElevenLabs read-only account check", () => {
  it("maps API fields to the existing redacted result without claiming a voice proof", () => {
    const result = runCheck({ workspace: account.workspace_id });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      readOnly: true,
      authenticated: true,
      workspaceMatches: true,
      tier: "creator",
      instantCloning: true,
      voiceLimit: 30,
      voiceSlotsUsed: 2,
      remainingCredits: 87_655,
      voiceWorkflowVerified: false,
    });
    expect(result.stdout).not.toContain(secret);
    expect(result.stdout).not.toContain(account.workspace_id);
    expect(result.stdout).not.toContain(account.email);
  });

  it("does not imply workspace verification when no workspace is configured", () => {
    const result = runCheck({
      response: {
        ...account,
        subscription: { ...account.subscription, character_count: 100_001 },
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      workspaceMatches: null,
      remainingCredits: 0,
    });
  });

  it("returns failure for an authenticated but different workspace", () => {
    const result = runCheck({ workspace: "different-workspace" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      authenticated: true,
      workspaceMatches: false,
    });
  });

  it.each([
    { status: 403, response: { detail: secret } },
    { rejectRequest: true },
    { response: { ...account, subscription: { ...account.subscription, voice_limit: secret } } },
  ])("redacts rejected, unavailable and invalid provider responses (%j)", (options) => {
    const result = runCheck(options);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      "ElevenLabs account check failed. Check the server key, scopes and provider status.",
    );
    expect(result.stderr).not.toContain(secret);
    expect(result.stderr).not.toContain(account.email);
  });

  it("exits with configuration status before requesting an account without a key", () => {
    const result = runCheck({ missingKey: true });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      "ELEVENLABS_API_KEY must be configured in the server environment.",
    );
  });
});
