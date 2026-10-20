import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioSessionProvider } from "../src/contexts/StudioSessionContext";
import {
  createStudioSessionState,
  retainStudioConversationMessages,
  STUDIO_RECENT_BOT_LIMIT,
  STUDIO_CONVERSATION_MESSAGE_LIMIT,
  type StudioSessionState,
} from "../src/lib/studio-session-state";
import type { StudioConversationSession, StudioMessage } from "../src/components/StudioWorkroom";

const h = vi.hoisted(() => ({
  owner: "owner-a" as string | null,
  ref: { current: null as unknown },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => h.ref,
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: h.owner ? { id: h.owner } : null }),
}));

const message = (id: string): StudioMessage => ({
  id,
  role: "agent",
  content: id,
  createdAt: "2026-09-27T00:00:00Z",
});
const conversation = (): StudioConversationSession => ({
  snapshot: {
    messages: [],
    clearing: false,
    clearError: null,
    replyError: null,
    interrupted: false,
  },
  loaded: true,
  operations: new Map(),
  listeners: new Set(),
});
const draft = (text: string) => ({ text, command: null, commandNonce: null });
function renderProvider(route: string) {
  return (StudioSessionProvider({ children: route }) as ReactElement<{ value: StudioSessionState }>)
    .props.value;
}

beforeEach(() => {
  h.owner = "owner-a";
  h.ref = { current: null };
});

describe("Studio account session", () => {
  it("keeps setup edits, distinct Bot/mode drafts and pending receipts across route children", () => {
    const before = renderProvider("/studio");
    before.setupDrafts.edit("bot-a", "greeting", "Unsent greeting");
    before.drafts.set("bot-a:configure", draft("Build draft"));
    before.drafts.set("bot-a:test", draft("Test draft"));
    before.drafts.set("bot-b:configure", draft("Other Bot"));
    before.computerDrafts.set("bot-a", {
      goal: "Read the public price.",
      startUrl: "https://botbound.app/pricing",
      showComposer: true,
    });
    before.computerDrafts.set("bot-b", {
      goal: "Read opening hours.",
      startUrl: "",
      showComposer: false,
    });
    const session = conversation();
    const operation = {
      snapshot: { pending: true, saved: false, error: null },
      listeners: new Set<() => void>(),
    };
    session.operations.set("proposal:change-0", operation);
    session.snapshot.messages = [message("proposal")];
    before.conversations.set("bot-a:configure", session);

    expect(renderProvider("/inbox")).toBe(before);
    operation.snapshot = { pending: false, saved: true, error: null };
    const after = renderProvider("/studio");
    expect(after.setupDrafts.read("bot-a").values.greeting).toBe("Unsent greeting");
    expect(after.drafts.get("bot-a:configure")?.text).toBe("Build draft");
    expect(after.drafts.get("bot-a:test")?.text).toBe("Test draft");
    expect(after.drafts.get("bot-b:configure")?.text).toBe("Other Bot");
    expect(after.computerDrafts.get("bot-a")).toEqual({
      goal: "Read the public price.",
      startUrl: "https://botbound.app/pricing",
      showComposer: true,
    });
    expect(after.computerDrafts.get("bot-b")?.goal).toBe("Read opening hours.");
    expect(
      after.conversations.get("bot-a:configure")?.operations.get("proposal:change-0")?.snapshot
        .saved,
    ).toBe(true);
    expect(after.conversations.has("bot-b:configure")).toBe(false);
  });

  it("discards state synchronously on account switch and logout, including late old receipts", () => {
    const original = renderProvider("/studio");
    original.drafts.set("bot-a:test", draft("Private content"));
    original.setupDrafts.edit("bot-a", "greeting", "Private greeting");
    original.computerDrafts.set("bot-a", {
      goal: "Private computer draft",
      startUrl: "https://example.test/private",
      showComposer: true,
    });
    h.owner = "owner-b";
    const next = renderProvider("/studio");
    expect(next.ownerId).toBe("owner-b");
    expect(next.drafts.size).toBe(0);
    expect(next.computerDrafts.size).toBe(0);
    expect(next.setupDrafts.read("bot-a").values.greeting).toBe("");
    original.conversations.set("bot-a:configure", conversation());
    expect(next.conversations.size).toBe(0);
    h.owner = null;
    expect(renderProvider("/signin").ownerId).toBeNull();
    h.owner = "owner-a";
    const returning = renderProvider("/studio");
    expect(returning).not.toBe(original);
    expect(returning.drafts.size).toBe(0);
    expect(returning.computerDrafts.size).toBe(0);
    expect(returning.conversations.size).toBe(0);
  });

  it("retains pending clear state and its confirmed result while Studio is unmounted", () => {
    const state = renderProvider("/studio");
    const session = conversation();
    session.snapshot = { ...session.snapshot, messages: [message("old")], clearing: true };
    state.conversations.set("bot-a:configure", session);
    renderProvider("/inbox");
    expect(renderProvider("/studio").conversations.get("bot-a:configure")?.snapshot.clearing).toBe(
      true,
    );
    renderProvider("/inbox");
    session.snapshot = { ...session.snapshot, clearing: false, messages: [] };
    session.operations.clear();
    expect(
      renderProvider("/studio").conversations.get("bot-a:configure")?.snapshot.messages,
    ).toEqual([]);
  });

  it("bounds clean recent Bots without evicting drafts, mounted sessions or outstanding writes", () => {
    const state = createStudioSessionState("owner-a");
    for (const id of ["clean", "setup", "draft", "computer", "save", "clear", "mounted"]) {
      state.visitBot(id);
      state.conversations.set(`${id}:configure`, conversation());
    }
    state.setupDrafts.edit("setup", "greeting", "Unsaved");
    state.drafts.set("draft:test", draft("Unsent"));
    state.computerDrafts.set("computer", {
      goal: "Unsent task",
      startUrl: "",
      showComposer: true,
    });
    state.conversations.get("save:configure")!.operations.set("old:change-0", {
      snapshot: { pending: true, saved: false, error: null },
      listeners: new Set(),
    });
    state.conversations.get("clear:configure")!.snapshot.clearing = true;
    state.conversations.get("mounted:configure")!.listeners.add(() => {});
    for (let i = 0; i < STUDIO_RECENT_BOT_LIMIT + 10; i++) {
      state.visitBot(`recent-${i}`);
      state.conversations.set(`recent-${i}:configure`, conversation());
    }
    expect(state.conversations.size).toBe(STUDIO_RECENT_BOT_LIMIT);
    expect(state.conversations.has("clean:configure")).toBe(false);
    for (const id of ["setup", "draft", "computer", "save", "clear", "mounted"]) {
      expect(state.conversations.has(`${id}:configure`)).toBe(true);
    }
  });

  it("makes the recent-Bot bound soft when all older Bots have dirty drafts", () => {
    const state = createStudioSessionState("owner-a");
    for (let i = 0; i < STUDIO_RECENT_BOT_LIMIT + 3; i++) {
      state.visitBot(`bot-${i}`);
      state.drafts.set(`bot-${i}:configure`, draft(`Unsaved ${i}`));
    }
    expect(state.drafts.size).toBe(STUDIO_RECENT_BOT_LIMIT + 3);
    expect(state.drafts.get("bot-0:configure")?.text).toBe("Unsaved 0");
    state.drafts.set("bot-0:configure", draft(""));
    state.visitBot("bot-last");
    expect(state.drafts.has("bot-0:configure")).toBe(false);
  });

  it("bounds message history and prunes obsolete receipts, preserving a pending save's message", () => {
    const session = conversation();
    const messages = Array.from({ length: STUDIO_CONVERSATION_MESSAGE_LIMIT + 5 }, (_, i) =>
      message(`message-${i}`),
    );
    session.operations.set("message-0:change-0", {
      snapshot: { pending: true, saved: false, error: null },
      listeners: new Set(),
    });
    session.operations.set("message-1:change-0", {
      snapshot: { pending: false, saved: true, error: null },
      listeners: new Set(),
    });
    const retained = retainStudioConversationMessages(session, messages);
    expect(retained).toHaveLength(STUDIO_CONVERSATION_MESSAGE_LIMIT + 1);
    expect(retained[0].id).toBe("message-0");
    expect(session.operations.has("message-0:change-0")).toBe(true);
    expect(session.operations.has("message-1:change-0")).toBe(false);
    session.operations.get("message-0:change-0")!.snapshot.pending = false;
    session.operations.get("message-0:change-0")!.snapshot.saved = true;
    expect(retainStudioConversationMessages(session, retained)).toHaveLength(
      STUDIO_CONVERSATION_MESSAGE_LIMIT,
    );
    expect(session.operations.size).toBe(0);
  });

  it("preserves unsaved, failed, and communication proposals beyond the message bound", () => {
    const session = conversation();
    const messages = Array.from({ length: STUDIO_CONVERSATION_MESSAGE_LIMIT + 5 }, (_, i) =>
      message(`message-${i}`),
    );
    messages[0].proposals = {
      changes: [{ field: "name", label: "Bot name", value: "Front Desk" }],
    };
    // An unmounted new card has no receipt yet and must still remain reviewable.
    messages[1].proposals = {
      toolToggles: [{ tool: "send_email", label: "Email", enable: true }],
    };
    session.operations.set("message-1:tool-0", {
      snapshot: { pending: false, saved: false, error: "Try again" },
      listeners: new Set(),
    });
    messages[2].proposals = {
      changes: [{ field: "name", label: "Bot name", value: "Saved name" }],
    };
    session.operations.set("message-2:change-0", {
      snapshot: { pending: false, saved: true, error: null },
      listeners: new Set(),
    });
    const communication = {
      kind: "send_email",
      label: "Follow-up",
      to: "customer@example.test",
      body: "Review this exact draft before sending.",
    };
    messages[3].proposals = { actions: [communication] };

    const retained = retainStudioConversationMessages(session, messages);
    expect(retained).toHaveLength(STUDIO_CONVERSATION_MESSAGE_LIMIT + 3);
    expect(retained.slice(0, 3).map((item) => item.id)).toEqual([
      "message-0",
      "message-1",
      "message-3",
    ]);
    expect(retained[2].proposals?.actions).toEqual([communication]);
    expect(session.operations.get("message-1:tool-0")?.snapshot.error).toBe("Try again");
    expect(session.operations.has("message-2:change-0")).toBe(false);
  });

  it("does not evict Bots with unsaved, failed, or communication proposals", () => {
    const state = createStudioSessionState("owner-a");
    for (const id of ["unsaved", "failed", "communication", "saved"]) {
      const session = conversation();
      const proposal = message(id);
      proposal.proposals = {
        changes: [{ field: "name", label: "Bot name", value: id }],
      };
      if (id === "communication") {
        proposal.proposals = {
          actions: [{ kind: "make_call", label: "Call draft", context: "Ask about availability." }],
        };
      } else if (id !== "unsaved") {
        session.operations.set(`${id}:change-0`, {
          snapshot: {
            pending: false,
            saved: id === "saved",
            error: id === "failed" ? "Try again" : null,
          },
          listeners: new Set(),
        });
      }
      session.snapshot.messages = [proposal];
      state.visitBot(id);
      state.conversations.set(`${id}:configure`, session);
    }
    for (let i = 0; i < STUDIO_RECENT_BOT_LIMIT + 2; i++) {
      state.visitBot(`recent-${i}`);
      state.conversations.set(`recent-${i}:configure`, conversation());
    }
    expect(state.conversations.size).toBe(STUDIO_RECENT_BOT_LIMIT);
    for (const id of ["unsaved", "failed", "communication"]) {
      expect(state.conversations.has(`${id}:configure`)).toBe(true);
    }
    expect(state.conversations.has("saved:configure")).toBe(false);
  });

  it("keeps the Bot bound soft until reviewable drafts are explicitly cleared", () => {
    const state = createStudioSessionState("owner-a");
    for (let i = 0; i < STUDIO_RECENT_BOT_LIMIT + 3; i++) {
      const session = conversation();
      session.snapshot.messages = [
        {
          ...message(`proposal-${i}`),
          proposals: { toolToggles: [{ tool: "send_email", label: "Email", enable: true }] },
        },
      ];
      state.visitBot(`bot-${i}`);
      state.conversations.set(`bot-${i}:configure`, session);
    }
    expect(state.conversations.size).toBe(STUDIO_RECENT_BOT_LIMIT + 3);
    state.conversations.get("bot-0:configure")!.snapshot.messages = [];
    state.visitBot("bot-last");
    expect(state.conversations.has("bot-0:configure")).toBe(false);
    expect(state.conversations.has("bot-1:configure")).toBe(true);
  });
});
