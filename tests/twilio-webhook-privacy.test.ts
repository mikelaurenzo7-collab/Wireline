import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFailoverVoicemailEmail,
  opaqueIdSuffixForLog,
  phoneSuffixForLog,
} from "../src/lib/twilio-webhook-privacy";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Twilio webhook privacy hardening", () => {
  it("keeps diagnostic suffixes without logging complete identifiers", () => {
    expect(phoneSuffixForLog("+1 (415) 555-0123")).toBe("***0123");
    expect(phoneSuffixForLog("")).toBeNull();
    expect(phoneSuffixForLog("not-a-number")).toBeNull();
    expect(opaqueIdSuffixForLog("SM1234567890abcdef")).toBe("…90abcdef");
    expect(opaqueIdSuffixForLog("   ")).toBeNull();
  });

  it("escapes caller-controlled voicemail fields before rendering email HTML", () => {
    const email = buildFailoverVoicemailEmail({
      from: "<caller>",
      to: '"target"',
      durationSeconds: 42,
      recordingUrl: 'https://api.twilio.com/recordings/RE123?note="private"&x=1',
      transcription: '<img src=x onerror="boom">&\'',
    });

    expect(email.html).toContain("&lt;caller&gt;");
    expect(email.html).toContain("&quot;target&quot;");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;boom&quot;&gt;&amp;&#39;");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain('href="https://api.twilio.com/');
    expect(email.text).toContain('Transcript: <img src=x onerror="boom">&\'');
  });

  it("renders untrusted recording URLs as text instead of clickable links", () => {
    const email = buildFailoverVoicemailEmail({
      from: "",
      to: "",
      durationSeconds: null,
      recordingUrl: 'javascript:alert("x")',
      transcription: "",
    });

    expect(email.html).not.toContain('href="javascript:');
    expect(email.html).toContain("javascript:alert(&quot;x&quot;)");
  });

  it("keeps sensitive webhook content out of operational logs", () => {
    const route = read("src/routes/twilio-webhook-base.ts");
    const forbiddenSnippets = [
      "from: from.slice(0, 16)",
      "to: to.slice(0, 16)",
      "body: body.slice(0, 80)",
      'log.error("VAPI FAILOVER TRIGGERED", { to, from })',
      'log.warn("Voicemail complete missing RecordingUrl", { from, to })',
      'log.warn("Voicemail recorded but no tenant matched To number", { to, from, recordingUrl })',
      "<li><strong>Transcript:</strong> ${transcription}</li>",
    ];

    for (const snippet of forbiddenSnippets) {
      expect(route).not.toContain(snippet);
    }
    expect(route).toContain("buildFailoverVoicemailEmail");
    expect(route).toContain("body_length: body.length");
    expect(route).toContain("message_sid_suffix: opaqueIdSuffixForLog(messageSid)");
  });
});
