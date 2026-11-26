import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_THREAD_PARAM,
  notifyStudioChatsChanged,
  parseStudioThreadParam,
  setActiveStudioChat,
} from "../src/lib/studio-active-chat";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Studio chats in the workspace rail", () => {
  it("accepts only a fresh chat, the earlier conversation, or a saved chat id", () => {
    expect(parseStudioThreadParam(null)).toBeUndefined();
    expect(parseStudioThreadParam("")).toBeUndefined();
    expect(parseStudioThreadParam("new")).toBeNull();
    expect(parseStudioThreadParam("legacy")).toBe("legacy");
    expect(parseStudioThreadParam("3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c")).toBe(
      "3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c",
    );
    expect(parseStudioThreadParam("computer")).toBeUndefined();
    expect(parseStudioThreadParam("../other")).toBeUndefined();
    expect(parseStudioThreadParam("3f2c1a9e")).toBeUndefined();
  });

  it("keeps the open chat and the refresh counter in page-session memory only", () => {
    const store = read("src/lib/studio-active-chat.ts");
    expect(store).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    // Setting the same chat twice and notifying must not throw without listeners.
    setActiveStudioChat({ agentId: "a", threadId: "t" });
    setActiveStudioChat({ agentId: "a", threadId: "t" });
    notifyStudioChatsChanged();
    setActiveStudioChat(null);
  });

  it("lists chats under the selected Bot and opens them through Studio's own guard", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const rail = read("src/components/studio/StudioChatRail.tsx");
    const workspace = read("src/components/StudioWorkspaceV2.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");

    expect(shell).toMatch(/!collapsed && selectedAgent \? \(\s*<StudioChatRail/);
    expect(rail).toContain("workspace/messages?view=history");
    expect(rail).toContain('aria-label="Chats"');
    expect(rail).toContain("New chat");
    expect(rail).toContain("STUDIO_THREAD_PARAM");
    expect(STUDIO_THREAD_PARAM).toBe("conversation");

    // A rail link is applied once, behind the unsent-draft confirmation, then removed.
    expect(workspace).toContain("parseStudioThreadParam(conversationParam)");
    expect(workspace).toContain('window.confirm("Leave this unsent draft?")');
    expect(workspace).toContain("next.delete(STUDIO_THREAD_PARAM)");

    // The list refreshes when a reply is saved or a chat is cleared.
    expect(workroom.match(/notifyStudioChatsChanged\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
