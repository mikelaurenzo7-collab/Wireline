import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ owned: vi.fn(), save: vi.fn() }));
vi.mock("../src/lib/agent-ownership", () => ({ findOwnedAgentId: h.owned }));
vi.mock("../src/lib/owner-memory-store", () => ({ changeOwnerMemory: h.save }));
import { prepareConnectorTask, saveConfirmedConnectorNote } from "../src/lib/connector-work";
import { buildWorkHandoffUrl, readWorkHandoff } from "../src/lib/work-handoff";
import { MCP_DEFAULT_SCOPES, requestedMcpScopes } from "../src/lib/chatgpt-mcp";
beforeEach(() => {
  vi.resetAllMocks();
  h.owned.mockResolvedValue("bot-a");
  h.save.mockResolvedValue(undefined);
});
describe("private connector notes", () => {
  it("does not add note access to existing clients through default scopes", () => {
    expect(MCP_DEFAULT_SCOPES).not.toContain("notes.write");
    expect(requestedMcpScopes(undefined)).not.toContain("notes.write");
    expect(requestedMcpScopes("agents.read notes.write")).toEqual(["agents.read", "notes.write"]);
  });
  it("uses Studio's same owned, deduplicated Memory writer", async () => {
    const result = await saveConfirmedConnectorNote("owner-a", {
      agent_id: "bot-a",
      content: "  Follow up on Oak Street.  ",
      confirmed: true,
    });
    expect(h.save).toHaveBeenCalledExactlyOnceWith("owner-a", "bot-a", {
      action: "add",
      content: "Follow up on Oak Street.",
    });
    expect(result).toEqual({ status: "saved", agent_id: "bot-a" });
    expect(result).not.toHaveProperty("content");
  });
  it.each([
    { agent_id: "bot-a", content: "note" },
    { agent_id: "bot-a", content: "note", confirmed: false },
    { agent_id: "bot-a", content: "note", confirmed: "true" },
    { agent_id: "bot-a", content: " ", confirmed: true },
    { agent_id: "bot-a", content: "x".repeat(501), confirmed: true },
    { agent_id: "bot-a", content: "note", confirmed: true, user_id: "owner-b" },
    { agent_id: "bot-a", content: "note", confirmed: true, source: "customer_training" },
  ])("requires exact explicit consent and rejects injected authority %j", async (input) => {
    await expect(saveConfirmedConnectorNote("owner-a", input)).rejects.toMatchObject({
      status: 400,
    });
    expect(h.save).not.toHaveBeenCalled();
  });
  it("does not claim success when ownership or capacity rejects a note", async () => {
    h.save.mockRejectedValue(new Error("Bot not found."));
    await expect(
      saveConfirmedConnectorNote("owner-a", {
        agent_id: "bot-b",
        content: "note",
        confirmed: true,
      }),
    ).rejects.toThrow("Bot not found.");
  });
});
describe("review-only task handoffs", () => {
  it("checks ownership and keeps task text outside HTTP URL parameters", async () => {
    const result = await prepareConnectorTask(
      "owner-a",
      { agent_id: "bot-a", goal: "Find roofing contractors & compare prices" },
      "https://botbound.app",
    );
    expect(h.owned).toHaveBeenCalledExactlyOnceWith("bot-a", "owner-a");
    const url = new URL(result.review_url);
    expect(url.pathname).toBe("/studio");
    expect(url.searchParams.get("agent")).toBe("bot-a");
    expect(url.searchParams.get("chat")).toBe("computer");
    expect(url.search).not.toContain("contractors");
    expect(readWorkHandoff(url.hash)).toBe("Find roofing contractors & compare prices");
    expect(result.status).toBe("review_required");
    expect(h.save).not.toHaveBeenCalled();
  });
  it("does not hand off another tenant's Bot", async () => {
    h.owned.mockResolvedValue(null);
    await expect(
      prepareConnectorTask(
        "owner-a",
        { agent_id: "bot-b", goal: "Find contractors" },
        "https://botbound.app",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each(["", "hey", "x".repeat(2001)])(
    "rejects an invalid task before querying data",
    async (goal) => {
      await expect(
        prepareConnectorTask("owner-a", { agent_id: "bot-a", goal }, "https://botbound.app"),
      ).rejects.toMatchObject({ status: 400 });
      expect(h.owned).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "#voice=test",
    "#task=hey",
    "#task=good+task&task=evil",
    "#task=good+task&autostart=1",
    "#task=" + "x".repeat(2001),
  ])("rejects ambiguous fragment %s", (hash) => expect(readWorkHandoff(hash)).toBeNull());
  it("round-trips Unicode and punctuation as inert text", () => {
    const goal = "Buscar técnicos: revisar café, HVAC & mañana. <script>nothing()</script>";
    const url = new URL(buildWorkHandoffUrl("https://botbound.app", "bot#one", goal));
    expect(url.searchParams.get("agent")).toBe("bot#one");
    expect(readWorkHandoff(url.hash)).toBe(goal);
  });
});
