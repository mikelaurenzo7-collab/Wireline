import { describe, expect, it } from "vitest";

import {
  signBrowserHandoffToken,
  verifyBrowserHandoffToken,
} from "../src/lib/browser-handoff-token";
import type { BrowserCommandContext } from "../src/lib/browser-command-context";

const sampleContext: BrowserCommandContext = {
  title: "Example page",
  url: "https://example.com/docs",
  description: "Docs",
  selection: "Selected paragraph",
  link: "",
  request: "Use this page as context.",
};

describe("browser handoff token contract", () => {
  it("round-trips a signed handoff for the issuing user", () => {
    const token = signBrowserHandoffToken("user-123", sampleContext);
    const redeemed = verifyBrowserHandoffToken(token, "user-123");
    expect(redeemed).toEqual(sampleContext);
  });

  it("rejects tokens for a different user", () => {
    const token = signBrowserHandoffToken("user-123", sampleContext);
    expect(verifyBrowserHandoffToken(token, "user-456")).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const token = signBrowserHandoffToken("user-123", sampleContext);
    const tampered = `${token.slice(0, -1)}x`;
    expect(verifyBrowserHandoffToken(tampered, "user-123")).toBeNull();
  });
});
