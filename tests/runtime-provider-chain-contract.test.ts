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

describe("OpenAI-first structured runtime provider chain", () => {
  it("tries direct OpenAI, then Gemini, then the AI Gateway", () => {
    const openAI = position('providers.push({ name: "OpenAI"');
    const gemini = position('providers.push({ name: "Gemini"');
    const gateway = position('providers.push({ name: "AI Gateway"');

    expect(openAI).toBeLessThan(gemini);
    expect(gemini).toBeLessThan(gateway);
    expect(client).toContain("OpenAI request failed; trying Gemini fallback");
    expect(client).toContain("Gemini request failed; trying AI Gateway fallback");
  });

  it("keeps direct xAI behind an explicit experimental fallback flag", () => {
    const gateway = position('providers.push({ name: "AI Gateway"');
    const xai = position('providers.push({ name: "xAI"');

    expect(gateway).toBeLessThan(xai);
    expect(client).toContain("WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK");
    expect(client).toContain('const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"');
    expect(client).toContain("AI Gateway request failed; trying explicitly enabled xAI fallback");
  });

  it("routes managed turns to current explicit OpenAI model IDs", () => {
    expect(client).toContain('endpoint: "https://api.openai.com/v1/responses"');
    expect(client).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(client).toContain('requested.startsWith("gpt-") ? requested : OPENAI_STRUCTURED_PRIMARY_MODEL');
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
