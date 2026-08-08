import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectAiDisclosure, detectRecordingDisclosure } from "../src/lib/tcpa-consent";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// FCC 24-17 makes an AI-generated voice an "artificial or prerecorded voice"
// under the TCPA, with per-call statutory damages, in every state. The runtime
// injects the AI disclosure on outbound calls, but injection is not delivery —
// the consent ledger has to carry per-call evidence, exactly as it does for the
// (narrower, two-party-state-only) recording disclosure.
describe("AI-identity disclosure detection", () => {
  it("matches the disclosure the runtime actually injects", () => {
    // complianceFirstMessagePrefix() emits this verbatim on outbound AI calls.
    const injected = "This call uses an automated AI assistant on behalf of Acme Dental.";
    expect(detectAiDisclosure(injected).found).toBe(true);
    // The runtime's exact phrasing must stay detectable: if the prefix is
    // reworded without updating the patterns, every outbound call would start
    // logging ai_disclosure_not_detected and paging.
    const runtime = read("src/lib/agent-runtime.ts");
    const prefixMatch = runtime.match(/This call uses an automated AI assistant\$\{onBehalf\}\./);
    expect(prefixMatch).not.toBeNull();
    expect(detectAiDisclosure("This call uses an automated AI assistant.").found).toBe(true);
  });

  it("accepts natural agent paraphrases", () => {
    for (const line of [
      "Hi there — I'm an AI assistant calling on behalf of Acme Roofing.",
      "Just so you know, I am an automated assistant.",
      "This is an automated call from Acme.",
      "You're speaking with an AI assistant.",
      "I'm not a human — I'm a virtual agent for Acme.",
    ]) {
      expect(detectAiDisclosure(line).found, line).toBe(true);
    }
  });

  it("does not mistake a consumer's question for the agent disclosing", () => {
    // The transcript carries both sides. A caller probing whether they're
    // talking to a bot is the opposite of the business having disclosed, and
    // logging it as evidence would put a false record in a legal ledger.
    for (const line of [
      "Am I talking to a real person?",
      "Is this an AI?",
      "Are you a robot or a human?",
      "I hate when companies use automated systems.",
    ]) {
      expect(detectAiDisclosure(line).found, line).toBe(false);
    }
  });

  it("returns an excerpt for the ledger evidence field", () => {
    const result = detectAiDisclosure(
      "Good morning. This call uses an automated AI assistant on behalf of Acme. How are you?",
    );
    expect(result.found).toBe(true);
    expect(result.excerpt).toContain("automated");
  });

  it("keeps the two disclosure detectors independent", () => {
    // A recording notice is not an AI disclosure and vice versa — collapsing
    // them would let one satisfy the other's legal obligation.
    const recordingOnly = "This call may be recorded for quality and training purposes.";
    const aiOnly = "This call uses an automated AI assistant.";
    expect(detectRecordingDisclosure(recordingOnly).found).toBe(true);
    expect(detectAiDisclosure(recordingOnly).found).toBe(false);
    expect(detectAiDisclosure(aiOnly).found).toBe(true);
    expect(detectRecordingDisclosure(aiOnly).found).toBe(false);
  });

  it("treats an empty transcript as unverifiable, not as absent", () => {
    expect(detectAiDisclosure("").found).toBe(false);
    expect(detectAiDisclosure(null).found).toBe(false);
  });
});

describe("AI-identity disclosure evidence is persisted per outbound call", () => {
  const handlers = read("src/lib/vapi-handlers.ts");

  it("writes its own event family, outbound only, idempotently", () => {
    expect(handlers).toContain("persistAiDisclosureEvidence");
    expect(handlers).toContain("AI_DISCLOSURE_EVENTS");
    // Outbound only: a consumer who dialed in was not sent an AI voice call.
    expect(handlers).toMatch(
      /call\?\.type === "outboundPhoneCall"[\s\S]{0,400}persistAiDisclosureEvidence/,
    );
    // Redelivery safety mirrors the recording-disclosure path.
    const block = handlers.slice(
      handlers.indexOf("async function persistAiDisclosureEvidence"),
      handlers.indexOf("async function persistComplianceEvidence"),
    );
    expect(block).toContain("onConflictDoNothing()");
    expect(block).toContain("inserted.length > 0");
  });

  it("alerts on an unverified AI disclosure regardless of state", () => {
    const block = handlers.slice(
      handlers.indexOf("async function persistAiDisclosureEvidence"),
      handlers.indexOf("async function persistComplianceEvidence"),
    );
    expect(block).toContain("tcpa_ai_disclosure_unverified");
    // The recording alert is fenced on two-party states; this obligation is
    // federal, so it must NOT carry that fence.
    expect(block).not.toContain('rule === "two_party"');
    // A call with no conversation at all is not evidence of a missed notice.
    expect(block).toContain("carriedConversation");
  });

  it("has a dedicated per-call uniqueness index", () => {
    // Sharing 0136's index would make the AI row and the recording row for one
    // call contend for a single slot, silently dropping one of them.
    const migration = read("drizzle/migrations/0138_ai_disclosure_evidence_uniqueness.sql");
    expect(migration).toContain("uq_consent_log_call_ai_disclosure");
    expect(migration).toContain("ai_disclosure_played");
    expect(migration).toContain("call_id IS NOT NULL");
    expect(read("drizzle/migrations/meta/_journal.json")).toContain(
      "0138_ai_disclosure_evidence_uniqueness",
    );
  });
});
