import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const client = readFileSync(resolve(process.cwd(), "src/lib/ai-client.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

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
    expect(client).toContain("xAI request failed; trying direct OpenAI fallback");
    expect(client).toContain("OpenAI request failed; trying Gemini fallback");
  });

  it("routes managed structured turns to the direct xAI Responses API", () => {
    expect(client).toContain('const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"');
    expect(client).toContain("callXAI");
    expect(client).toContain("XAI_STRUCTURED_PRIMARY_MODEL");
    // xAI only ever receives grok-* ids; OpenAI/Gemini ids never leak to xAI.
    expect(client).toContain("/grok/i.test(requested) ? requested : XAI_STRUCTURED_PRIMARY_MODEL");
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
