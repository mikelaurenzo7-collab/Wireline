import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    // Continuity references only this committed non-speech chime. Pin the file
    // so a stray deletion cannot silently reintroduce a missing-media gap.
    const route = read("src/routes/twilio-webhook-base.ts");
    expect(route).toContain("/sounds/wireline-transfer-chime.wav");
    expect(route).not.toContain("wireline-transfer-chime.mp3");
    expect(
      statSync(resolve(process.cwd(), "public/sounds/wireline-transfer-chime.wav")).size,
    ).toBeGreaterThan(10_000);
  });

  it("lets OpenAI own the first audible Bot identity without a generated jingle", () => {
    const route = read("src/routes/twilio-webhook-base.ts");
    const packageJson = read("package.json");
    const quarantine = read("scripts/quarantine-retired-public-assets.mjs");

    expect(route).not.toContain("/sounds/wireline-jingle.mp3");
    expect(route).not.toContain("/sounds/botbound-jingle.mp3");
    expect(route).not.toContain("BOTBOUND_JINGLE_ASSET_APPROVED");
    expect(route).toContain("OpenAI owns the audible Bot identity and first greeting");
    expect(read(".env.example")).not.toContain("BOTBOUND_JINGLE_ASSET_APPROVED");
    expect(packageJson).toContain("node scripts/quarantine-retired-public-assets.mjs");
    expect(packageJson).not.toContain("validate-botbound-jingle");
    expect(packageJson).not.toContain("generate-jingle");
    expect(quarantine).toContain('resolve(distRoot, "wireline-jingle.mp3")');
    expect(quarantine).toContain('resolve(distRoot, "botbound-jingle.mp3")');
    expect(quarantine).toContain("rmSync(asset, { force: true })");
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
    expect(route).toContain("support@botbound.me");
    expect(route).toContain("twimlEmpty()");
    // Twilio's native Advanced Opt-Out (OptOutType) is handled ahead of the
    // legacy keyword-matching base router so it never double-replies.
    expect(wrapper).toContain("optOutType");
  });
});
