import { describe, expect, it } from "vitest";
import { selectPaidBotIdentityAgents } from "../src/lib/paid-bot-identity-capacity";

const bots = [{ id: "oldest" }, { id: "middle" }, { id: "newest" }];
describe("paid identity allocation capacity", () => {
  it("bounds a larger retained roster after a downgrade", () => {
    expect(selectPaidBotIdentityAgents(bots, [], 1)).toEqual(["oldest"]);
  });
  it("honors additional purchased phone slots", () => {
    expect(selectPaidBotIdentityAgents(bots, [], 3)).toEqual(["oldest", "middle", "newest"]);
  });
  it("preserves an existing live assignment ahead of an older unwired draft", () => {
    expect(selectPaidBotIdentityAgents(bots, [{ agentId: "newest" }], 1)).toEqual(["newest"]);
  });
  it("does not allocate extra identities when retained lines exceed a downgraded plan", () => {
    expect(
      selectPaidBotIdentityAgents(bots, [{ agentId: "middle" }, { agentId: "newest" }], 1),
    ).toEqual(["middle"]);
  });
  it("accounts for multiple lines already held by the same Bot", () => {
    expect(
      selectPaidBotIdentityAgents(bots, [{ agentId: "oldest" }, { agentId: "oldest" }], 2),
    ).toEqual(["oldest"]);
  });
  it("allows a detached line to be reused without buying another number", () => {
    expect(
      selectPaidBotIdentityAgents(bots, [{ agentId: null }, { agentId: "newest" }], 2),
    ).toEqual(["newest", "oldest"]);
  });
  it("keeps an orphan assignment in the capacity count", () => {
    expect(selectPaidBotIdentityAgents(bots, [{ agentId: "deleted-bot" }], 1)).toEqual([]);
  });
  it("does not reopen capacity with a detached line beside an over-capacity orphan", () => {
    expect(
      selectPaidBotIdentityAgents(bots, [{ agentId: null }, { agentId: "deleted-bot" }], 1),
    ).toEqual([]);
  });
  it("does not reopen capacity with a detached line beside duplicate assignments", () => {
    expect(
      selectPaidBotIdentityAgents(
        bots,
        [{ agentId: null }, { agentId: "oldest" }, { agentId: "oldest" }],
        2,
      ),
    ).toEqual(["oldest"]);
  });
  it("keeps connected-client drafts private until a phone line is explicitly attached", () => {
    const draft = {
      id: "oldest",
      businessVariables: { customizationProfile: { source: "chatgpt_mcp" } },
    };
    expect(selectPaidBotIdentityAgents([draft, { id: "newest" }], [], 2)).toEqual(["newest"]);
    expect(selectPaidBotIdentityAgents([draft], [{ agentId: "oldest" }], 1)).toEqual(["oldest"]);
  });
  it("keeps the same selected roster as earlier jobs finish provisioning", () => {
    expect(selectPaidBotIdentityAgents(bots, [], 2)).toEqual(["oldest", "middle"]);
    expect(selectPaidBotIdentityAgents(bots, [{ agentId: "middle" }], 2).sort()).toEqual([
      "middle",
      "oldest",
    ]);
  });
  it.each([0, -1, NaN, Infinity])(
    "fails closed for unavailable or invalid capacity %s",
    (slots) => {
      expect(selectPaidBotIdentityAgents(bots, [], slots)).toEqual([]);
    },
  );
});
