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

describe("OpenAI-first structured runtime fallback chain", () => {
  it("tries AI Gateway, then direct OpenAI, then Gemini", () => {
    const gateway = position('providers.push({ name: "AI Gateway"');
    const openAI = position('providers.push({ name: "OpenAI"');
    const gemini = position('providers.push({ name: "Gemini"');

    expect(gateway).toBeLessThan(openAI);
    expect(openAI).toBeLessThan(gemini);
    expect(client).toContain("AI Gateway request failed; trying direct OpenAI fallback");
    expect(client).toContain("OpenAI request failed; trying Gemini fallback");
    expect(client).not.toContain(
      "const primary = isAIGatewayConfigured() ? callGateway : callOpenAI",
    );
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
