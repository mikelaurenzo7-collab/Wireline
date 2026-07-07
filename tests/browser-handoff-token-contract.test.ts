import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { BrowserCommandContext } from "../src/lib/browser-command-context";
import {
  BROWSER_HANDOFF_ID_PREFIX,
  createBrowserHandoffId,
  decryptBrowserHandoffContext,
  encryptBrowserHandoffContext,
  hashBrowserHandoffId,
  studioHandoffUrl,
} from "../src/lib/browser-handoff-token";

process.env.WIRELINE_DATA_KEY ||= Buffer.alloc(32, 7).toString("base64");

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const sampleContext: BrowserCommandContext = {
  title: "Example page",
  url: "https://example.com/docs",
  description: "Docs",
  selection: "Selected paragraph",
  link: "",
  request: "Use this page as context.",
};

describe("browser handoff privacy contract", () => {
  it("builds Studio URLs with an opaque handoff id instead of embedded context", () => {
    const handoffId = createBrowserHandoffId();
    const url = studioHandoffUrl(handoffId);

    expect(handoffId).toMatch(new RegExp(`^${BROWSER_HANDOFF_ID_PREFIX}`));
    expect(url).toContain("handoff_id=");
    expect(url).not.toContain("handoff=");
    expect(url).not.toContain("Example");
    expect(url).not.toContain("Selected");
  });

  it("encrypts browser context before storage", () => {
    const encrypted = encryptBrowserHandoffContext(sampleContext);

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(sampleContext.title);
    expect(encrypted).not.toContain(sampleContext.selection);
    expect(decryptBrowserHandoffContext(encrypted)).toEqual(sampleContext);
  });

  it("hashes ids for database lookup without storing redeemable ids", () => {
    const handoffId = createBrowserHandoffId();
    const hash = hashBrowserHandoffId(handoffId);

    expect(hash).not.toContain(handoffId);
    expect(hashBrowserHandoffId(handoffId)).toBe(hash);
  });

  it("persists handoffs server-side with ttl, user binding, and one-time redeem", () => {
    const route = read("src/routes/browser-handoff-routes.ts");

    expect(route).toContain("wireline_browser_handoffs");
    expect(route).toContain("context_encrypted");
    expect(route).toContain("expires_at");
    expect(route).toContain("redeemed_at IS NULL");
    expect(route).toContain("expires_at > now()");
    expect(route).toContain("SET redeemed_at = now()");
    expect(route).toContain("handoff_id");
    expect(route).not.toContain("signBrowserHandoffToken");
    expect(route).not.toContain("verifyBrowserHandoffToken");
  });
});
