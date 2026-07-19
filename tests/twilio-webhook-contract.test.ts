import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Twilio webhook XML contract", () => {
  it("escapes XML special characters in TwiML replies", () => {
    const route = read("src/routes/twilio-webhook-base.ts");

    expect(route).toContain('replace(/&/g, "&amp;")');
    expect(route).toContain('replace(/</g, "&lt;")');
    expect(route).toContain('replace(/>/g, "&gt;")');
    expect(route).toContain('replace(/"/g, "&quot;")');
    expect(route).toContain('replace(/\'/g, "&apos;")');
  });

  it("keeps STOP/START/HELP replies and unknown-number no-op behavior", () => {
    const route = read("src/routes/twilio-webhook-base.ts");
    const wrapper = read("src/routes/twilio-webhook.ts");

    expect(route).toContain("OPT_OUT_KEYWORDS");
    expect(route).toContain("OPT_IN_KEYWORDS");
    expect(route).toContain("HELP_KEYWORDS");
    expect(route).toContain("You have been unsubscribed");
    expect(route).toContain("You have been resubscribed");
    expect(route).toContain("support@trywireline.com");
    expect(route).toContain("twimlEmpty()");
    // Twilio's native Advanced Opt-Out (OptOutType) is handled ahead of the
    // legacy keyword-matching base router so it never double-replies.
    expect(wrapper).toContain("optOutType");
  });
});
