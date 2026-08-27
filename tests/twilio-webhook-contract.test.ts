import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs generation script imported for its pure brand guard.
import { assertBotBoundJinglePrompt, jingleFingerprint } from "../scripts/generate-jingle.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Twilio webhook XML contract", () => {
  it("hangs up before media when the failover tenant cannot be classified", () => {
    // A signed callback can outlive a tenant's production classification. A
    // lookup failure must never make a reclassified line speak, dial, or record.
    const route = read("src/routes/twilio-webhook-base.ts");
    expect(route).toContain("Signed Twilio inbound tenant lookup failed closed");
    expect(route).toContain("if (!tenantUserId) return res.status(200).send(twimlHangup())");
  });

  it("ships the committed sound assets the TwiML references", () => {
    // Both <Play> URLs referenced assets that did not exist for weeks; pin the
    // committed files so a stray deletion cannot silently reintroduce the gap.
    const route = read("src/routes/twilio-webhook-base.ts");
    expect(route).toContain("/sounds/wireline-transfer-chime.wav");
    expect(route).not.toContain("wireline-transfer-chime.mp3");
    expect(
      statSync(resolve(process.cwd(), "public/sounds/wireline-transfer-chime.wav")).size,
    ).toBeGreaterThan(10_000);
  });

  it("never plays the retired Wireline jingle on the public BotBound demo", () => {
    const route = read("src/routes/twilio-webhook-base.ts");
    const packageJson = read("package.json");
    const quarantine = read("scripts/quarantine-retired-public-assets.mjs");

    expect(route).not.toContain("/sounds/wireline-jingle.mp3");
    expect(route).toContain('process.env.BOTBOUND_JINGLE_ASSET_APPROVED === "true"');
    expect(route).toContain("/sounds/botbound-jingle.mp3");
    expect(route).toContain("Welcome to BotBound. Meet Mira, our playful front desk Bot.");
    expect(read(".env.example")).toContain("BOTBOUND_JINGLE_ASSET_APPROVED=false");
    expect(packageJson).toContain("node scripts/quarantine-retired-public-assets.mjs");
    expect(packageJson).toContain("node scripts/validate-botbound-jingle.mjs");
    expect(quarantine).toContain('resolve(distRoot, "wireline-jingle.mp3")');
    expect(quarantine).toContain("rmSync(asset, { force: true })");
  });

  it("fails closed before a retired-brand jingle can be generated or silently reused", () => {
    const script = read("scripts/generate-jingle.mjs");
    expect(() => assertBotBoundJinglePrompt("Welcome to Wireline.")).toThrow(
      "retired public branding",
    );
    expect(() => assertBotBoundJinglePrompt("Welcome to BotBound.")).not.toThrow();
    expect(jingleFingerprint("Welcome to BotBound.", 8_000)).not.toBe(
      jingleFingerprint("A different BotBound song.", 8_000),
    );
    expect(script).toContain("audioProvenanceMatches(BOTBOUND_JINGLE_OUTPUT_PATH, fingerprint)");
    expect(script).toContain("writeAudioProvenance(BOTBOUND_JINGLE_OUTPUT_PATH, fingerprint, buf");
    expect(script).toContain("exists without a matching prompt fingerprint");
    expect(read("scripts/validate-botbound-jingle.mjs")).toContain(
      "requires a present, brand-safe jingle whose recipe and audio hashes match",
    );
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
