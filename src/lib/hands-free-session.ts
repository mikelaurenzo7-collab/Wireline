/** Owner-initiated, half-duplex speech. This never grants authority to an action. */
export type HandsFreePhase = "off" | "starting" | "listening" | "speaking" | "working";
export type HandsFreeSnapshot = { phase: HandsFreePhase; message: string; active: boolean };
export type HandsFreeCommand = "send" | "save_note" | "clear" | "read" | "stop";

export function handsFreeCommand(text: string, sendPhrase: string): HandsFreeCommand | null {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[.!?,]+$/g, "")
    .trim();
  if (normalized === sendPhrase) return "send";
  if (normalized === "save note") return "save_note";
  if (normalized === "clear draft") return "clear";
  if (normalized === "read draft") return "read";
  if (normalized === "stop listening" || normalized === "pause listening") return "stop";
  return null;
}

export type HandsFreeSpeech = {
  listen: (events: {
    started: () => void;
    result: (text: string) => void;
    ended: () => void;
    error: (message: string) => void;
  }) => () => void;
  speak: (text: string, done: () => void, failed: () => void) => () => void;
};

export type HandsFreeActions = {
  getDraft: () => string;
  setDraft: (text: string) => void;
  sendPhrase: "send task" | "send message";
  maxLength: () => number;
  canSubmit: () => boolean;
  submit: () => Promise<boolean>;
  saveNote: (text: string) => Promise<void>;
};

export const HANDS_FREE_SESSION_MS = 5 * 60_000;
export const HANDS_FREE_SILENCE_MS = 60_000;

/** Speak bounded plain text; never vocalize link destinations or markup. */
export function handsFreeSpokenText(text: string): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link available in chat")
    .replace(/[*#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 1_200
    ? `${plain.slice(0, 1_100)}. The full text is available in Studio.`
    : plain;
}

/** Injectable speech transport makes permission, echo and late-event races testable. */
export class HandsFreeSession {
  private snapshot: HandsFreeSnapshot = { phase: "off", message: "", active: false };
  private listeners = new Set<() => void>();
  private stopRecognition?: () => void;
  private stopSpeech?: () => void;
  private timeout?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;
  private busy = false;
  private latestResponse = "";
  private pendingAction?: { response: string };

  constructor(
    private speech: HandsFreeSpeech,
    private actions: HandsFreeActions,
  ) {}

  getSnapshot = () => this.snapshot;
  /** React development effects may detach and reattach the same instance. */
  activate = () => {
    this.disposed = false;
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(phase: HandsFreePhase, message: string, active = this.snapshot.active) {
    if (this.disposed) return;
    this.snapshot = { phase, message, active };
    this.listeners.forEach((listener) => listener());
  }

  private silence() {
    ++this.generation;
    clearTimeout(this.timeout);
    this.stopRecognition?.();
    this.stopRecognition = undefined;
    this.stopSpeech?.();
    this.stopSpeech = undefined;
  }

  stop = (message = "Hands-free ended. Any work already sent continues in Studio.") => {
    this.pendingAction = undefined;
    this.silence();
    clearTimeout(this.deadline);
    this.update("off", message, false);
  };

  start = () => {
    if (this.disposed || this.snapshot.active) return;
    this.silence();
    this.update("starting", "Waiting for microphone permission…", true);
    this.deadline = setTimeout(
      () => this.stop("Five-minute session ended. Start again when ready."),
      HANDS_FREE_SESSION_MS,
    );
    if (this.busy) this.update("working", "Waiting for your Bot. The microphone is paused.");
    else this.listen();
  };

  checkAudio = () => {
    if (this.disposed) return;
    const text =
      "BotBound audio check. Check that you hear this through the device you intended to use.";
    if (this.snapshot.active) return this.say(text);
    this.silence();
    const generation = this.generation;
    const current = () => !this.disposed && generation === this.generation;
    this.update("speaking", "Playing audio check…", false);
    this.timeout = setTimeout(() => {
      if (current()) this.stop("Audio check was interrupted. Check your phone’s audio output.");
    }, 15_000);
    try {
      this.stopSpeech = this.speech.speak(
        text,
        () => {
          if (!current()) return;
          this.silence();
          this.update(
            "off",
            "Audio check finished. Start listening when your microphone and output are ready.",
            false,
          );
        },
        () => {
          if (current()) this.stop("Audio check was interrupted. Check your phone’s audio output.");
        },
      );
    } catch {
      this.stop("Audio playback is unavailable. You can still type your request.");
    }
  };

  private listen() {
    if (!this.snapshot.active || this.disposed) return;
    this.silence();
    if (this.busy) return this.update("working", "Waiting for your Bot. The microphone is paused.");
    const generation = this.generation;
    const current = () => this.snapshot.active && !this.disposed && generation === this.generation;
    this.update("starting", "Starting microphone…");
    this.timeout = setTimeout(
      () => this.stop("Microphone did not start. Check site permissions and try again."),
      15_000,
    );
    try {
      this.stopRecognition = this.speech.listen({
        started: () => {
          if (!current()) return;
          clearTimeout(this.timeout);
          this.update(
            "listening",
            `Listening. Say “${this.actions.sendPhrase}” to submit your draft.`,
          );
          this.timeout = setTimeout(
            () => this.stop("Listening paused after a minute of silence."),
            HANDS_FREE_SILENCE_MS,
          );
        },
        result: (text) => {
          if (!current() || !text.trim()) return;
          this.silence();
          void this.handle(text.trim());
        },
        ended: () => {
          if (current()) this.stop("Microphone stopped. Start listening again when ready.");
        },
        error: (message) => {
          if (current()) this.stop(message);
        },
      });
    } catch {
      this.stop("Speech input could not start. You can still type your request.");
    }
  }

  private say(text: string) {
    if (!this.snapshot.active || this.disposed) return;
    this.silence();
    const generation = this.generation;
    const spoken = handsFreeSpokenText(text);
    const current = () => this.snapshot.active && !this.disposed && generation === this.generation;
    this.update("speaking", "Reading aloud. The microphone is paused.");
    this.timeout = setTimeout(
      () => {
        if (current()) this.stop("Playback did not finish. Check your audio output and restart.");
      },
      Math.min(120_000, Math.max(15_000, spoken.length * 100 + 10_000)),
    );
    try {
      this.stopSpeech = this.speech.speak(
        spoken,
        () => {
          if (current()) this.listen();
        },
        () => {
          if (current())
            this.stop("Audio playback was interrupted. Check your output and restart.");
        },
      );
    } catch {
      this.stop("Audio playback is unavailable. Your draft is still here.");
    }
  }

  private async handle(text: string) {
    const command = handsFreeCommand(text, this.actions.sendPhrase);
    if (command === "stop") return this.stop();
    if (command === "clear") {
      this.actions.setDraft("");
      return this.say("Draft cleared.");
    }
    const draft = this.actions.getDraft().trim();
    if (command === "read") return this.say(draft || "Your draft is empty.");
    if (command === "send" || command === "save_note") {
      if (!draft) return this.say("Your draft is empty. Dictate a request first.");
      if (command === "send" && !this.actions.canSubmit())
        return this.say("This request cannot be sent yet. Check the message in Studio.");
      if (command === "save_note" && draft.length > 500)
        return this.say("Private notes can have up to 500 characters. Shorten your draft first.");
      this.update(
        "working",
        command === "save_note" ? "Saving private note…" : "Sending your request…",
      );
      const action = { response: "" };
      this.pendingAction = action;
      try {
        const accepted =
          command === "save_note"
            ? (await this.actions.saveNote(draft), true)
            : await this.actions.submit();
        if (this.disposed || !this.snapshot.active || this.pendingAction !== action) return;
        this.pendingAction = undefined;
        if (!accepted)
          return this.stop("The request was not confirmed. Review Studio before trying again.");
        if (command === "save_note") {
          if (this.actions.getDraft().trim() === draft) this.actions.setDraft("");
          this.say(
            ["Private note saved. You can manage it in your Bot's Memory.", action.response]
              .filter(Boolean)
              .join(" "),
          );
        } else if (action.response) this.say(action.response);
        else if (this.busy)
          this.update("working", "Waiting for your Bot. The microphone is paused.");
        else this.say("Request sent. Follow its progress in Studio.");
      } catch (error) {
        if (!this.disposed && this.snapshot.active && this.pendingAction === action)
          this.stop(
            error instanceof Error
              ? error.message
              : "The action was not confirmed. Your draft is still here.",
          );
      }
      return;
    }
    const next = [draft, text].filter(Boolean).join(" ");
    if (next.length > this.actions.maxLength())
      return this.say("Your draft is too long. Shorten it before adding more.");
    this.actions.setDraft(next);
    this.say(
      `Draft: ${next}. Say ${this.actions.sendPhrase} to submit, save note to remember it privately, or keep dictating.`,
    );
  }

  observe(responseKey: string, response: string, busy: boolean) {
    const changed = responseKey !== this.latestResponse;
    this.latestResponse = responseKey;
    const wasBusy = this.busy;
    this.busy = busy;
    if (!this.snapshot.active) return;
    // React can report idle before submit() settles. Keep capture paused until
    // the receipt is known, and read a fast response once after acceptance.
    if (this.pendingAction) {
      if (changed && response.trim()) this.pendingAction.response = response;
      return;
    }
    if (changed && response.trim()) this.say(response);
    else if (busy && this.snapshot.phase !== "working" && this.snapshot.phase !== "speaking") {
      this.silence();
      this.update("working", "Waiting for your Bot. The microphone is paused.");
    } else if (wasBusy && !busy && this.snapshot.phase === "working") this.listen();
  }

  dispose = () => {
    this.disposed = true;
    this.pendingAction = undefined;
    this.silence();
    clearTimeout(this.deadline);
    this.snapshot = { phase: "off", active: false, message: "" };
    this.listeners.clear();
  };
}
