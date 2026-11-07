import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HANDS_FREE_SESSION_MS,
  HANDS_FREE_SILENCE_MS,
  HandsFreeSession,
  handsFreeCommand,
  handsFreeSpokenText,
  type HandsFreeSpeech,
} from "../src/lib/hands-free-session";

function fixture() {
  let draft = "";
  let allowed = true;
  let max = 2000;
  const listens: Array<{
    events: Parameters<HandsFreeSpeech["listen"]>[0];
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const speech: Array<{
    text: string;
    done: () => void;
    failed: () => void;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const submit = vi.fn(async () => {
    draft = "";
    return true;
  });
  const saveNote = vi.fn(async (_text: string) => {});
  const session = new HandsFreeSession(
    {
      listen: (events) => {
        const stop = vi.fn();
        listens.push({ events, stop });
        return stop;
      },
      speak: (text, done, failed) => {
        const stop = vi.fn();
        speech.push({ text, done, failed, stop });
        return stop;
      },
    },
    {
      getDraft: () => draft,
      setDraft: (next) => {
        draft = next;
      },
      sendPhrase: "send task",
      maxLength: () => max,
      canSubmit: () => allowed,
      submit,
      saveNote,
    },
  );
  const start = () => {
    session.start();
    listens.at(-1)?.events.started();
  };
  const hear = async (text: string) => {
    listens.at(-1)!.events.result(text);
    await Promise.resolve();
    await Promise.resolve();
  };
  const finishSpeaking = () => {
    speech.at(-1)!.done();
    listens.at(-1)?.events.started();
  };
  return {
    session,
    listens,
    speech,
    submit,
    saveNote,
    start,
    hear,
    finishSpeaking,
    setDraft: (text: string) => {
      draft = text;
    },
    getDraft: () => draft,
    block: () => {
      allowed = false;
    },
    setMax: (next: number) => {
      max = next;
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("explicit hands-free commands", () => {
  it.each(["Send task.", " send task! ", "SEND TASK"])("accepts standalone %s", (input) =>
    expect(handsFreeCommand(input, "send task")).toBe("send"),
  );
  it.each([
    "Please send task",
    "send task tomorrow",
    "do not send task",
    "send message",
    "Save note about the roof",
    "stop listening tomorrow",
  ])("dictates %s without granting confirmation", (input) =>
    expect(handsFreeCommand(input, "send task")).toBeNull(),
  );
  it("separates task and message confirmation", () => {
    expect(handsFreeCommand("send message", "send message")).toBe("send");
    expect(handsFreeCommand("send task", "send message")).toBeNull();
  });
  it("bounds readouts and does not vocalize URL destinations", () => {
    expect(handsFreeSpokenText("**Read [the report](https://secret.example/token).**")).toBe(
      "Read the report.",
    );
    expect(handsFreeSpokenText("x".repeat(2000))).toContain("full text is available in Studio");
    expect(handsFreeSpokenText("x".repeat(2000)).length).toBeLessThanOrEqual(1200);
  });
});
describe("hands-free lifecycle and authority", () => {
  it("does not capture, speak or submit until opt-in", () => {
    const f = fixture();
    expect(f.listens).toHaveLength(0);
    expect(f.speech).toHaveLength(0);
    expect(f.session.getSnapshot().active).toBe(false);
  });
  it("checks audio without arming the microphone", () => {
    const f = fixture();
    f.session.checkAudio();
    expect(f.listens).toHaveLength(0);
    expect(f.session.getSnapshot().active).toBe(false);
    f.speech[0]!.done();
    expect(f.session.getSnapshot().phase).toBe("off");
    expect(f.listens).toHaveLength(0);
  });
  it("invalidates an unfinished audio check on busy session start", () => {
    const f = fixture();
    f.session.checkAudio();
    const old = f.speech[0]!;
    f.session.observe("", "", true);
    f.session.start();
    old.done();
    expect(f.session.getSnapshot()).toMatchObject({ active: true, phase: "working" });
    expect(old.stop).toHaveBeenCalledOnce();
    expect(f.listens).toHaveLength(0);
  });
  it("allows enough time for a long readout but bounds the whole session", () => {
    const f = fixture();
    f.start();
    f.session.observe("long", "A".repeat(1100), false);
    vi.advanceTimersByTime(50_000);
    expect(f.session.getSnapshot()).toMatchObject({ active: true, phase: "speaking" });
    vi.advanceTimersByTime(HANDS_FREE_SESSION_MS);
    expect(f.session.getSnapshot().active).toBe(false);
  });
  it("dictates into the current draft and submits only on a separate command", async () => {
    const f = fixture();
    f.setDraft("Find");
    f.start();
    await f.hear("roofing contractors near Oak Street");
    expect(f.getDraft()).toBe("Find roofing contractors near Oak Street");
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.listens[0]!.stop).toHaveBeenCalledOnce();
    f.finishSpeaking();
    await f.hear("send task");
    expect(f.submit).toHaveBeenCalledOnce();
  });
  it("ignores duplicate results and echoes from an aborted generation", async () => {
    const f = fixture();
    f.start();
    const old = f.listens[0]!.events;
    await f.hear("Prepare a roof inspection checklist");
    old.result("send task");
    old.error("old failure");
    old.ended();
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.session.getSnapshot().phase).toBe("speaking");
    f.finishSpeaking();
    await f.hear("send task");
    old.result("send task");
    expect(f.submit).toHaveBeenCalledOnce();
  });
  it("rechecks readiness at confirmation and preserves a blocked draft", async () => {
    const f = fixture();
    f.setDraft("Find contractors");
    f.start();
    f.block();
    await f.hear("send task");
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.getDraft()).toBe("Find contractors");
  });
  it("does not submit an empty draft", async () => {
    const f = fixture();
    f.start();
    await f.hear("send task");
    expect(f.submit).not.toHaveBeenCalled();
  });
  it("saves the exact confirmed note without starting work", async () => {
    const f = fixture();
    f.setDraft("Oak Street needs a follow-up inspection.");
    f.start();
    await f.hear("save note");
    expect(f.saveNote).toHaveBeenCalledExactlyOnceWith("Oak Street needs a follow-up inspection.");
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.getDraft()).toBe("");
    expect(f.speech.at(-1)!.text).toContain("Private note saved");
  });
  it("keeps a draft after an ambiguous save and never retries automatically", async () => {
    const f = fixture();
    f.setDraft("Inspect the roof.");
    f.saveNote.mockRejectedValue(new Error("Check Memory before retrying."));
    f.start();
    await f.hear("save note");
    expect(f.getDraft()).toBe("Inspect the roof.");
    expect(f.session.getSnapshot().active).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(f.saveNote).toHaveBeenCalledOnce();
  });
  it("preserves newer edits while a note save is pending", async () => {
    const f = fixture();
    let resolve!: () => void;
    f.saveNote.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    f.setDraft("First note");
    f.start();
    await f.hear("save note");
    f.setDraft("Keep these newer edits");
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.getDraft()).toBe("Keep these newer edits");
  });
  it("rejects notes above the existing Memory bound", async () => {
    const f = fixture();
    f.setDraft("x".repeat(501));
    f.start();
    await f.hear("save note");
    expect(f.saveNote).not.toHaveBeenCalled();
  });
  it("preserves overlength tasks rather than silently truncating", async () => {
    const f = fixture();
    f.setDraft("x".repeat(1998));
    f.start();
    await f.hear("add more");
    expect(f.getDraft()).toBe("x".repeat(1998));
    expect(f.speech.at(-1)!.text).toContain("too long");
  });
  it("uses a changed reply limit without replacing the live session", async () => {
    const f = fixture();
    f.start();
    f.setMax(10);
    await f.hear("This request is longer than ten characters");
    expect(f.getDraft()).toBe("");
    expect(f.session.getSnapshot().active).toBe(true);
  });
  it("reads, clears and stops without submitting", async () => {
    const f = fixture();
    f.setDraft("My task");
    f.start();
    await f.hear("read draft");
    expect(f.speech.at(-1)!.text).toBe("My task");
    f.finishSpeaking();
    await f.hear("clear draft");
    expect(f.getDraft()).toBe("");
    f.finishSpeaking();
    await f.hear("stop listening");
    expect(f.session.getSnapshot().active).toBe(false);
    expect(f.submit).not.toHaveBeenCalled();
  });
  it("pauses capture while working and reads each new result once", () => {
    const f = fixture();
    f.session.observe("old", "Earlier private response", false);
    f.start();
    expect(f.speech).toHaveLength(0);
    f.session.observe("old", "Earlier private response", true);
    expect(f.session.getSnapshot().phase).toBe("working");
    f.session.observe("new", "Three contractors found.", false);
    f.session.observe("new", "Three contractors found.", false);
    expect(f.speech).toHaveLength(1);
    f.finishSpeaking();
    expect(f.session.getSnapshot().phase).toBe("listening");
  });
  it("never revives a stopped session on late results", () => {
    const f = fixture();
    f.start();
    f.session.stop("Audio route changed.");
    f.listens[0]!.events.result("send task");
    f.session.observe("new", "Private result", false);
    expect(f.speech).toHaveLength(0);
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.session.getSnapshot().message).toBe("Audio route changed.");
  });
  it("ends on playback failure instead of hearing its own interrupted readout", async () => {
    const f = fixture();
    f.start();
    await f.hear("Find contractors");
    f.speech[0]!.failed();
    expect(f.session.getSnapshot().active).toBe(false);
    expect(f.listens).toHaveLength(1);
  });
  it("bounds dismissed permission prompts, silence and the whole session", () => {
    const f = fixture();
    f.session.start();
    vi.advanceTimersByTime(15_000);
    expect(f.session.getSnapshot().active).toBe(false);
    f.start();
    vi.advanceTimersByTime(HANDS_FREE_SILENCE_MS);
    expect(f.session.getSnapshot().active).toBe(false);
    f.session.observe("", "", true);
    f.session.start();
    vi.advanceTimersByTime(HANDS_FREE_SESSION_MS);
    expect(f.session.getSnapshot().active).toBe(false);
  });
  it("does not retry a failed submission", async () => {
    const f = fixture();
    f.submit.mockResolvedValue(false);
    f.setDraft("Find contractors");
    f.start();
    await f.hear("send task");
    expect(f.session.getSnapshot().active).toBe(false);
    expect(f.submit).toHaveBeenCalledOnce();
  });
  it("keeps capture paused when idle arrives before a failed submission settles", async () => {
    const f = fixture();
    let resolve!: (accepted: boolean) => void;
    f.submit.mockImplementation(() => new Promise<boolean>((done) => (resolve = done)));
    f.setDraft("Find contractors");
    f.start();
    await f.hear("send task");
    f.session.observe("", "", true);
    f.session.observe("", "", false);
    expect(f.session.getSnapshot().phase).toBe("working");
    expect(f.listens).toHaveLength(1);
    resolve(false);
    await Promise.resolve();
    expect(f.session.getSnapshot().active).toBe(false);
    expect(f.getDraft()).toBe("Find contractors");
    expect(f.submit).toHaveBeenCalledOnce();
  });
  it("reads a fast response once after its submission is accepted", async () => {
    const f = fixture();
    let resolve!: (accepted: boolean) => void;
    f.submit.mockImplementation(() => new Promise<boolean>((done) => (resolve = done)));
    f.setDraft("Find contractors");
    f.start();
    await f.hear("send task");
    f.session.observe("", "", true);
    f.session.observe("new", "Three contractors found.", false);
    expect(f.speech).toHaveLength(0);
    resolve(true);
    await Promise.resolve();
    expect(f.speech.map((entry) => entry.text)).toEqual(["Three contractors found."]);
    f.session.observe("new", "Three contractors found.", false);
    expect(f.speech).toHaveLength(1);
    f.finishSpeaking();
    expect(f.session.getSnapshot().phase).toBe("listening");
  });
  it("does not let a late receipt change a restarted session", async () => {
    const f = fixture();
    let resolve!: (accepted: boolean) => void;
    f.submit.mockImplementation(() => new Promise<boolean>((done) => (resolve = done)));
    f.setDraft("Find contractors");
    f.start();
    await f.hear("send task");
    f.session.stop();
    f.start();
    resolve(false);
    await Promise.resolve();
    expect(f.session.getSnapshot()).toMatchObject({ active: true, phase: "listening" });
    expect(f.speech).toHaveLength(0);
  });
  it("disposes on Bot changes and survives React development effect replay", () => {
    const f = fixture();
    f.start();
    f.session.dispose();
    f.listens[0]!.events.result("save note");
    expect(f.saveNote).not.toHaveBeenCalled();
    f.session.activate();
    f.start();
    expect(f.listens).toHaveLength(2);
  });
});
