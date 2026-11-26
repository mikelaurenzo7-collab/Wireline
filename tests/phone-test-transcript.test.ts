import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PHONE_TEST_TRANSCRIPT_MAX_CHARS,
  PHONE_TEST_TRANSCRIPT_MAX_LINES,
  phoneTestTranscriptLines,
  readPhoneTestReceipt,
} from "../src/lib/phone-test-contract";
import {
  compactOpenAITranscript,
  createTranscriptProgressRecorder,
} from "../src/lib/voice/openai-sip-session";

const KEY = "11111111-2222-4333-8444-555555555555";
const read = (path: string) => readFileSync(path, "utf8");

function body(transcript?: unknown) {
  return {
    test: {
      id: KEY,
      agent_id: "bot-a",
      status: "connected",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      phone_last4: "0123",
    },
    ...(transcript === undefined ? {} : { transcript }),
  };
}

afterEach(() => vi.useRealTimers());

describe("phone test transcript lines", () => {
  it("reads the stored call transcript turn by turn", () => {
    const stored = compactOpenAITranscript([
      { role: "Agent", text: "Hi, I'm Riley, and I'm an AI assistant with Acme Plumbing." },
      { role: "Caller", text: "When are you open?\nI mean on Saturday." },
      { role: "Agent", text: "We open at eight." },
    ]);
    expect(phoneTestTranscriptLines(stored)).toEqual([
      { speaker: "bot", text: "Hi, I'm Riley, and I'm an AI assistant with Acme Plumbing." },
      { speaker: "caller", text: "When are you open? I mean on Saturday." },
      { speaker: "bot", text: "We open at eight." },
    ]);
    // The compaction marker of a very long call is not a turn.
    expect(phoneTestTranscriptLines("Agent: Hello.\n…\nCaller: Bye.")).toEqual([
      { speaker: "bot", text: "Hello." },
      { speaker: "caller", text: "Bye." },
    ]);
    for (const empty of [null, undefined, "", "   ", 42, "no speaker here"]) {
      expect(phoneTestTranscriptLines(empty)).toEqual([]);
    }
  });

  it("keeps the newest turns and bounds each one", () => {
    const many = Array.from(
      { length: PHONE_TEST_TRANSCRIPT_MAX_LINES + 5 },
      (_, index) => `Caller: turn ${index}`,
    ).join("\n");
    const lines = phoneTestTranscriptLines(many);
    expect(lines).toHaveLength(PHONE_TEST_TRANSCRIPT_MAX_LINES);
    expect(lines.at(-1)).toEqual({
      speaker: "caller",
      text: `turn ${PHONE_TEST_TRANSCRIPT_MAX_LINES + 4}`,
    });
    const long = phoneTestTranscriptLines(`Agent: ${"x".repeat(5_000)}`);
    expect(long[0]!.text).toHaveLength(PHONE_TEST_TRANSCRIPT_MAX_CHARS);
  });

  it("adds a valid transcript to the receipt and never lets a bad one hide the status", () => {
    const lines = [
      { speaker: "bot", text: "Hi." },
      { speaker: "caller", text: "Hello." },
    ];
    expect(readPhoneTestReceipt(body(lines), KEY, "bot-a")?.transcript).toEqual(lines);
    for (const malformed of [
      [{ speaker: "agent", text: "Hi." }],
      [{ speaker: "bot", text: "" }],
      [{ speaker: "bot", text: "x".repeat(PHONE_TEST_TRANSCRIPT_MAX_CHARS + 1) }],
      Array.from({ length: PHONE_TEST_TRANSCRIPT_MAX_LINES + 1 }, () => lines[0]),
      "Agent: Hi.",
      [],
    ]) {
      const receipt = readPhoneTestReceipt(body(malformed), KEY, "bot-a");
      expect(receipt?.status).toBe("connected");
      expect(receipt).not.toHaveProperty("transcript");
    }
  });
});

describe("live phone test transcript recorder", () => {
  it("coalesces turns into one ordered write per interval with the newest transcript", async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    let release!: () => void;
    const write = vi.fn(
      (transcript: string) =>
        new Promise<void>((resolve) => {
          writes.push(transcript);
          release = resolve;
        }),
    );
    const onError = vi.fn();
    const recorder = createTranscriptProgressRecorder(write, onError, 1_000);
    const snapshot = vi.fn(() => "Agent: Hi.\nCaller: When");
    recorder.notify(() => "Agent: Hi.");
    recorder.notify(snapshot);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    // Compaction runs once, for the snapshot that is actually written.
    expect(snapshot).toHaveBeenCalledOnce();
    expect(writes).toEqual(["Agent: Hi.\nCaller: When"]);

    // A later write waits for the one still in flight.
    recorder.notify(() => "Agent: Hi.\nCaller: When are you open?");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toHaveLength(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(["Agent: Hi.\nCaller: When", "Agent: Hi.\nCaller: When are you open?"]);
    release();

    // An unchanged transcript is not written again.
    recorder.notify(() => "Agent: Hi.\nCaller: When are you open?");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("writes nothing after stop, and reports a failed write without stopping later ones", async () => {
    vi.useFakeTimers();
    const write = vi
      .fn<(transcript: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const recorder = createTranscriptProgressRecorder(write, onError, 1_000);
    recorder.notify(() => "Agent: Hi.");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onError).toHaveBeenCalledOnce();
    recorder.notify(() => "Agent: Hi.\nCaller: Yes.");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(write).toHaveBeenCalledTimes(2);

    recorder.notify(() => "Agent: Hi.\nCaller: Yes.\nAgent: Great.");
    recorder.stop();
    recorder.notify(() => "never");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(write).toHaveBeenCalledTimes(2);
  });
});

describe("phone test transcript wiring", () => {
  it("records live only for owner phone tests, fenced to the running claim", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const record = session.slice(session.indexOf("function recordLivePhoneTestTranscript("));
    const fence = record.slice(0, record.indexOf("async function renewOpenAISipCallLease("));
    expect(fence).toContain('eq(schema.callLogs.openaiSipPhase, "running")');
    expect(fence).toContain("eq(schema.callLogs.openaiSipOwnerToken, claim.ownerToken)");
    expect(fence).toContain("eq(schema.callLogs.id, claim.callLogId)");
    expect(session).toContain(
      "input.phoneTest && claim\n          ? createTranscriptProgressRecorder(",
    );
    // The recorder stops before the session's final record is written.
    const runner = session.slice(session.indexOf("export async function runOpenAISipCallSession("));
    const stop = runner.indexOf("liveTranscript?.stop();");
    const finalRecord = runner.indexOf("await persistFinishedCall({");
    expect(stop).toBeGreaterThan(-1);
    expect(finalRecord).toBeGreaterThan(stop);
  });

  it("serves the transcript to the owner of the exact test call only after verification", () => {
    const route = read("src/routes/phone-test-routes.ts");
    expect(route).toContain(
      'test.status === "creating" || test.status === "ringing" || test.status === "verifying"',
    );
    expect(route).toContain("res.json({ test, ...(transcript.length ? { transcript } : {}) });");
    const service = read("src/lib/voice/phone-test.ts");
    const reader = service.slice(service.indexOf("export async function readPhoneTestTranscript("));
    const query = reader.slice(0, reader.indexOf("export function phoneTestWebhookUrl("));
    expect(query).toContain("eq(schema.callLogs.userId, userId)");
    expect(query).toContain("eq(schema.callLogs.agentId, agentId)");
    expect(query).toContain("eq(schema.callLogs.twilioParentCallSid, callSid)");
    expect(query).toContain("lead.agentId !== agentId || !CALL_SID.test(callSid)");
  });
});
