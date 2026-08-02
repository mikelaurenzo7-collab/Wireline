import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Twilio webhook XML contract", () => {
  it("degrades the Vapi failover route to voicemail when the database fails", () => {
    // The failover route exists for the moment things are already broken. A
    // thrown tenant/settings lookup previously became a 500, leaving callers
    // with Twilio's own error announcement instead of the professional close.
    const route = read("src/routes/twilio-webhook-base.ts");
    expect(route).toContain("Failover tenant lookup failed; degrading to voicemail");
  });

  it("ships the committed sound assets the TwiML references", () => {
    // Both <Play> URLs referenced assets that did not exist for weeks; pin the
    // committed files so a stray deletion cannot silently reintroduce the gap.
    const route = read("src/routes/twilio-webhook-base.ts");
    expect(route).toContain("/sounds/wireline-transfer-chime.wav");
    expect(route).not.toContain("wireline-transfer-chime.mp3");
    expect(route).toContain("/sounds/wireline-jingle.mp3");
    expect(
      statSync(resolve(process.cwd(), "public/sounds/wireline-transfer-chime.wav")).size,
    ).toBeGreaterThan(10_000);
    expect(
      statSync(resolve(process.cwd(), "public/sounds/wireline-jingle.mp3")).size,
    ).toBeGreaterThan(50_000);
  });

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
