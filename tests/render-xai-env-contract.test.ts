import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blueprint = readFileSync("render.yaml", "utf8");
const api = blueprint.slice(
  blueprint.indexOf("name: botbound-api"),
  blueprint.indexOf("name: botbound-voice"),
);
const worker = blueprint.slice(
  blueprint.indexOf("name: botbound-voice"),
  blueprint.indexOf("name: botbound-jobs-sweep"),
);

/** The `- key: NAME` block for one env var, up to the next `- key:` entry. */
function envVarBlock(section: string, key: string): string {
  const start = section.indexOf(`- key: ${key}\n`);
  if (start < 0) return "";
  const rest = section.slice(start + `- key: ${key}\n`.length);
  const next = rest.search(/\n\s*- key: /);
  return rest.slice(0, next < 0 ? undefined : next);
}

describe("Render Blueprint xAI wiring", () => {
  it("declares the xAI credentials and phone-provider flag on the API without values", () => {
    for (const key of ["XAI_API_KEY", "XAI_MANAGEMENT_API_KEY", "WIRELINE_PHONE_VOICE_PROVIDER"]) {
      const block = envVarBlock(api, key);
      expect(block, key).toContain("sync: false");
      expect(block, key).not.toContain("value:");
    }
  });

  it("mirrors only what the worker needs from the API so both services agree", () => {
    for (const key of ["XAI_API_KEY", "WIRELINE_PHONE_VOICE_PROVIDER"]) {
      const block = envVarBlock(worker, key);
      expect(block, key).toContain("fromService:");
      expect(block, key).toContain("name: botbound-api");
      expect(block, key).toContain(`envVarKey: ${key}`);
    }
    // Only the API runs the knowledge-index sweep.
    expect(worker).not.toContain("XAI_MANAGEMENT_API_KEY");
  });

  it("carries no retired provider keys", () => {
    expect(blueprint).not.toMatch(
      /GEMINI_API_KEY|XAI_API_KEY_CHATKIT|XAI_SIP_ALLOWED_ADDRESSES|VAPI_/,
    );
  });
});
