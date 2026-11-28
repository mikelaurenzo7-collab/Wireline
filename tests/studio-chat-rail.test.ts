import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_THREAD_PARAM,
  notifyStudioChatsChanged,
  parseStudioThreadParam,
  pendingStudioThreadRequest,
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

  /**
   * On 2026-11-27 Studio showed a paying customer "Something broke" (React
   * error 185), and pressing New chat in the rail reproduces it. The router
   * removes `?conversation=new` in a transition that React renders after
   * Studio's own change to the open chat, so Studio saw the request again each
   * time. `new` never equals the open chat, so each pass opened another fresh
   * chat, which rebuilt the whole conversation, until React stopped the loop.
   */
  describe("a rail link is applied once", () => {
    const bot = "bot-front-desk";
    const pass = (param: string | null, openThreadId: string, applied: string | null) =>
      pendingStudioThreadRequest({ param, agentId: bot, openThreadId, applied });

    it("opens one fresh chat however many times Studio sees the same request", () => {
      const first = pass("new", "thread-a", null);
      expect(first).not.toBeNull();
      // Studio opened a fresh chat, and the parameter is still in the address.
      expect(pass("new", "thread-b", first)).toBeNull();
      expect(pass("new", "thread-c", first)).toBeNull();
    });

    it("applies again once the parameter has gone and comes back", () => {
      const first = pass("new", "thread-a", null);
      // The removal landed: Studio forgets the request it applied.
      expect(pass(null, "thread-b", first)).toBeNull();
      expect(pass("new", "thread-b", null)).toBe(first);
    });

    it("treats another chat or another Bot as a new request", () => {
      const fresh = pass("new", "thread-a", null);
      const saved = pass("3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c", "thread-a", fresh);
      expect(saved).not.toBeNull();
      expect(saved).not.toBe(fresh);
      expect(
        pendingStudioThreadRequest({
          param: "new",
          agentId: "bot-sales",
          openThreadId: "thread-a",
          applied: fresh,
        }),
      ).not.toBeNull();
    });

    it("waits until a Bot and a chat are open", () => {
      expect(
        pendingStudioThreadRequest({ param: "new", agentId: "", openThreadId: "t", applied: null }),
      ).toBeNull();
      expect(
        pendingStudioThreadRequest({ param: "new", agentId: bot, openThreadId: "", applied: null }),
      ).toBeNull();
    });

    it("is remembered by Studio before it changes the open chat", () => {
      const workspace = read("src/components/StudioWorkspaceV2.tsx");
      const effect = workspace.slice(
        workspace.indexOf("const appliedConversation = useRef"),
        workspace.indexOf("const requestMessage = useCallback"),
      );
      expect(effect).toContain("pendingStudioThreadRequest({");
      expect(effect).toContain("applied: appliedConversation.current,");
      // Forgotten only once the parameter is gone.
      expect(effect).toMatch(
        /if \(!conversationParam\) \{\s*appliedConversation\.current = null;\s*return;\s*\}/,
      );
      // Remembered before the open chat changes, so the next pass is a no-op.
      expect(effect.indexOf("appliedConversation.current = request;")).toBeGreaterThan(-1);
      expect(effect.indexOf("appliedConversation.current = request;")).toBeLessThan(
        effect.indexOf("setThread({"),
      );
    });
  });
});
