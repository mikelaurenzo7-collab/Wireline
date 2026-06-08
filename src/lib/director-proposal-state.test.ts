import { describe, expect, it } from "vitest";
import {
  buildDirectorClearThreadConfirm,
  countPendingDirectorProposals,
  countPendingDirectorProposalsForMessage,
  directorProposalKey,
  mergeResolvedFromDirectorMessages,
  parseDirectorProposalKey,
} from "./director-proposal-state";

describe("director-proposal-state", () => {
  it("builds stable proposal keys", () => {
    expect(directorProposalKey("42", "change", 0)).toBe("42:change:0");
    expect(parseDirectorProposalKey("42:change:0")).toEqual({
      messageId: "42",
      relativeKey: "change:0",
    });
  });

  it("merges per-message resolved maps into flat client state", () => {
    expect(
      mergeResolvedFromDirectorMessages([
        { id: "10", role: "director", resolved: { "change:0": "done" } },
        { id: "11", role: "director", resolved: { "action:1": "dismissed" } },
      ]),
    ).toEqual({
      "10:change:0": "done",
      "11:action:1": "dismissed",
    });
  });

  it("counts unresolved proposal cards for one message", () => {
    const message = {
      id: "1",
      role: "director",
      proposals: {
        changes: [{ field: "first_message", value: "hi", label: "Greeting", summary: "" }],
        toolToggles: [],
        actions: [{ kind: "send_email", label: "Email", agentId: "a1" }],
        integrationJobs: [],
      },
    };
    expect(countPendingDirectorProposalsForMessage(message, {})).toBe(2);
    expect(countPendingDirectorProposalsForMessage(message, { "1:change:0": "done" })).toBe(1);
    expect(
      countPendingDirectorProposalsForMessage(message, {
        "1:change:0": "done",
        "1:action:0": "dismissed",
      }),
    ).toBe(0);
  });

  it("counts unresolved proposal cards", () => {
    const messages = [
      {
        id: "1",
        role: "director",
        proposals: {
          changes: [{ field: "first_message", value: "hi", label: "Greeting", summary: "" }],
          toolToggles: [],
          actions: [{ kind: "send_email", label: "Email", agentId: "a1" }],
          integrationJobs: [],
        },
      },
    ];
    expect(countPendingDirectorProposals(messages, {})).toBe(2);
    expect(countPendingDirectorProposals(messages, { "1:change:0": "done" })).toBe(1);
    expect(
      countPendingDirectorProposals(messages, {
        "1:change:0": "done",
        "1:action:0": "dismissed",
      }),
    ).toBe(0);
  });

  it("warns when clearing with pending approvals", () => {
    const none = buildDirectorClearThreadConfirm(0);
    expect(none).toContain("Kept: agent settings");
    expect(none).not.toContain("still pending");

    const some = buildDirectorClearThreadConfirm(3);
    expect(some).toContain("3 approval cards still pending");
  });
});
