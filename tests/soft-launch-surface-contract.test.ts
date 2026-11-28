import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { searchWorkspaceCommands } from "../src/components/CommandBar";
import { connectedCallPresence, VOICE_PRESENCE } from "../src/lib/voice-presence";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("soft launch surfaces", () => {
  it("keeps pause and stop on the computer viewport and recovery honest about the screen", () => {
    const computer = read("src/pages/ComputerPage.tsx");
    const css = read("src/styles/cloud-computer.css");
    expect(computer).toContain("viewportOwnsControls");
    expect(computer).toContain("wl-computer-screen__controls");
    expect(computer).toContain("const browserStillOpen = !active && task.liveView");
    expect(computer).toContain("The browser screen was cleared after this task ended.");
    const recoveryStart = computer.indexOf('className="wl-computer-recovery"');
    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    const recoveryEnd = computer.indexOf("<Sheet open={activityOpen}", recoveryStart);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const recovery = computer.slice(recoveryStart, recoveryEnd);
    expect(recovery).toContain("onClick={(event) => onStartAnother?.(event.currentTarget)}");
    expect(recovery).not.toContain('ownerAction("take")');
    expect(css).toContain(".wl-computer-screen__controls");
  });

  it("keeps the command palette on calls, email, and computer without sms, campaigns, or another Bot", () => {
    const commands = searchWorkspaceCommands(" ").map((command) => command.label);
    expect(commands).toEqual(expect.arrayContaining(["Calls", "Inbox", "Computer"]));
    // One Bot per account: the palette never offers to create another.
    expect(commands).not.toContain("Create a Bot");
    expect(commands.join(" ")).not.toMatch(/SMS|Campaign|Lead Hunt|Sequence/);
    expect(searchWorkspaceCommands("sms")).toEqual([]);
    expect(searchWorkspaceCommands("campaign")).toEqual([]);
  });

  it("keeps Bo's first question to one brief without promotional copy", () => {
    const bo = read("src/components/onboarding/BoOnboarding.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");
    // Bo asks one thing at a time, and the first answer is the owner's own
    // description of the business.
    expect(bo).toContain(
      'const QUESTION_STEPS = ["about", "website", "questions", "checks"] as const;',
    );
    expect(bo).toContain('step === "about" ? "About my business: "');
    for (const source of [bo, copy]) {
      expect(source).not.toContain("Answers and calls, plus email and a computer.");
      expect(source).not.toContain("SMS is coming soon");
      expect(source).not.toContain("setup wizard");
    }
  });

  it("shares listening, speaking, and thinking words between rehearsal and a live test call", () => {
    const rehearsal = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const phoneTest = read("src/components/PhoneTestDialog.tsx");
    const meter = read("src/styles/precision-studio.css");
    expect(rehearsal).toContain("VOICE_PRESENCE.listening");
    expect(rehearsal).toContain("VOICE_PRESENCE.speaking");
    expect(rehearsal).toContain("VOICE_PRESENCE.thinking");
    expect(phoneTest).toContain("connectedCallPresence()");
    expect(connectedCallPresence()).toContain(VOICE_PRESENCE.listening);
    expect(connectedCallPresence()).toContain(VOICE_PRESENCE.speaking);
    expect(meter).toContain(".wl-voice-bar__icon");
    expect(meter).not.toContain("wl-voice-bar-level");
  });
});
