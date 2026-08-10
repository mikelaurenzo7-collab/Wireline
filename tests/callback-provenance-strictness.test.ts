import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALLBACK_REQUEST_MARKER,
  isConsumerRequestedCallback,
} from "../src/lib/callback-engine";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("callback provenance is fail-closed", () => {
  it("accepts only the internally minted phone-call provenance value", () => {
    expect(isConsumerRequestedCallback({ [CALLBACK_REQUEST_MARKER]: "phone_call" })).toBe(true);

    for (const value of ["import", "webhook", "system", "callback", " phone_call ", true, 1, null]) {
      expect(
        isConsumerRequestedCallback({ [CALLBACK_REQUEST_MARKER]: value }),
        `unexpected callback provenance accepted: ${String(value)}`,
      ).toBe(false);
    }
  });

  it("persists truthful summaries for requested callbacks and scheduled follow-ups", () => {
    const engine = read("src/lib/callback-engine.ts");
    expect(engine).toContain('? "Requested callback placed automatically."');
    expect(engine).toContain(': "Scheduled outbound follow-up placed automatically."');
  });
});
