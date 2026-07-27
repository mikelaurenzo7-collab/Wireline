import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("conversation trust surfaces", () => {
  it("keeps conversation messages canonical and provenance-aware", () => {
    const message = source("src/components/molecules/ConversationMessage.tsx");

    expect(message).toContain("conversationMessageVariants = cva");
    expect(message).toContain('data-slot="conversation-message"');
    expect(message).toContain("author: {");
    expect(message).toContain("customer:");
    expect(message).toContain("assistant:");
    expect(message).toContain('channel?: "email" | "text" | "voice"');
  });

  it("keeps lifecycle activity semantic and reusable", () => {
    const activity = source("src/components/molecules/ConversationActivity.tsx");

    expect(activity).toContain("conversationActivityVariants = cva");
    expect(activity).toContain('data-slot="conversation-activity"');
    expect(activity).toContain("pending:");
    expect(activity).toContain("active:");
    expect(activity).toContain("complete:");
    expect(activity).toContain("failed:");
  });

  it("keeps inbox on canonical conversation and feedback primitives", () => {
    const inbox = source("src/components/EmailInbox.tsx");

    expect(inbox).toContain("ConversationActivity");
    expect(inbox).toContain("ConversationMessage");
    expect(inbox).toContain("StatusNotice");
    expect(inbox).toContain('channel="email"');
    expect(inbox).toContain('state="active"');
    expect(inbox).not.toContain("<article\n                          key={message.id}");
  });

  it("keeps StatusNotice action-safe rather than forwarding actions to the DOM", () => {
    const notice = source("src/components/molecules/StatusNotice.tsx");

    expect(notice).toContain("action?: React.ReactNode");
    expect(notice).toMatch(/\{action\s*\?\s*\(\s*<div/);
    expect(notice).toContain('({ tone = "info", title, icon, action');
  });
});
