import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const client = read("src/lib/ai-client.ts");
const models = read("src/lib/ai-models.ts");
const realtime = read("src/lib/voice/openai-realtime-config.ts");

function position(value: string) {
  const index = client.indexOf(value);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("Grok-first structured runtime provider chain", () => {
  it("tries direct xAI, then OpenAI, then Gemini, then the AI Gateway", () => {
    const xai = position('providers.push({ name: "xAI"');
    const openAI = position('providers.push({ name: "OpenAI"');
    const gemini = position('providers.push({ name: "Gemini"');
    const gateway = position('providers.push({ name: "AI Gateway"');

    expect(xai).toBeLessThan(openAI);
    expect(openAI).toBeLessThan(gemini);
    expect(gemini).toBeLessThan(gateway);
    expect(client).toContain("xAI request failed; trying OpenAI fallback");
    expect(client).toContain("OpenAI request failed; trying Gemini fallback");
    expect(client).toContain("Gemini request failed; trying AI Gateway fallback");
  });

  it("keeps direct xAI as the managed primary gated only on key presence", () => {
    expect(client).toContain('const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"');
    expect(client).toContain("if (process.env.XAI_API_KEY)");
    expect(client).not.toContain("WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK");
    expect(client).toContain("/grok/i.test(requested) ? requested : XAI_STRUCTURED_PRIMARY_MODEL");
    expect(models).toContain('GROK_4_5: "grok-4.5"');
    expect(models).toContain(
      "process.env.WIRELINE_XAI_STRUCTURED_MODEL?.trim() || XAI_MODELS.GROK_4_5",
    );
    expect(models).toContain(
      "export const STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL",
    );
  });

  it("routes continuity turns to current explicit OpenAI model IDs", () => {
    expect(client).toContain('endpoint: "https://api.openai.com/v1/responses"');
    expect(client).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(client).toContain(
      'requested.startsWith("gpt-") ? requested : OPENAI_STRUCTURED_PRIMARY_MODEL',
    );
    expect(models).toContain('GPT_5_6_TERRA: "gpt-5.6-terra"');
    expect(models).toContain(
      "process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_6_TERRA",
    );
    expect(realtime).toContain('OPENAI_REALTIME_MODEL || "gpt-realtime-2.1"');
    expect(realtime).toContain('OPENAI_REALTIME_TRANSCRIBER || "gpt-4o-mini-transcribe"');
  });

  it("does not turn an aborted request into another provider call", () => {
    expect(client).toContain("if (isAbortError(error, options?.signal)) throw error");
    expect(client).toContain("assertNotAborted(options?.signal)");
  });

  it("keeps provider response details in server logs instead of propagated errors", () => {
    expect(client).toContain('log.warn("[ai-runtime] provider request rejected"');
    expect(client).toContain(
      "throw new Error(`${args.provider} Responses request failed (${response.status})`)",
    );
    expect(client).not.toContain(
      "`${args.provider} Responses request failed (${response.status}): ${(await response.text()).slice(0, 500)}`",
    );
  });
});
