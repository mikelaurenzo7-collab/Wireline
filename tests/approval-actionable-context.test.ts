import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("actionable approvals", () => {
  it("keeps the caller and the task title on a follow-up made during a call", () => {
    const core = read("src/lib/bot-tools/core.ts");
    const tool = core.slice(core.indexOf('if (fn === "create_followup_task")'));
    expect(tool).toContain("const { title, description, priority } = args || {};");
    expect(tool).toContain("customerInfo: callerNumber ? { phone: callerNumber } : null,");
  });

  it("opens the linked conversation from Approvals", () => {
    const page = read("src/pages/EmailPage.tsx");
    expect(page).toContain(
      'requestedTab === "sms" && !SMS_LAUNCH_UI_ENABLED ? null : params.get("thread")',
    );
    expect(page).toContain('initialThreadId={params.get("thread")}');
    expect(read("src/components/EmailInbox.tsx")).toContain("setSelectedId(initialThreadId);");
    expect(read("src/components/SmsThreads.tsx")).toContain(
      "if (linked && next.some((thread) => thread.id === linked)) return linked;",
    );
  });
});
