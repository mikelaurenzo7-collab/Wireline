import { describe, expect, it } from "vitest";
import {
  claimsStudioReview,
  proposalMatchesReview,
  readStoredStudioMessageMetadata,
  storedStudioMessageMetadata,
} from "../src/lib/studio-proposal-state";

const change = {
  field: "first_message" as const,
  label: "Opening greeting",
  value: "Hello from our team.",
  summary: "Use this opening.",
};

describe("durable Studio review state", () => {
  it("stores normalized cards and reads owner save receipts", () => {
    const metadata = storedStudioMessageMetadata({
      changes: [change],
      toolToggles: [],
      actions: [],
    });
    expect(metadata).toEqual({
      proposals: { changes: [change], toolToggles: [], actions: [] },
      savedProposalKeys: [],
    });
    const restored = readStoredStudioMessageMetadata({
      ...metadata,
      savedProposalKeys: ["change-0"],
    });
    expect(restored?.savedProposalKeys).toEqual(["change-0"]);
    expect(
      proposalMatchesReview(restored!.proposals, "change-0", {
        field: "first_message",
        value: change.value,
      }),
    ).toBe(true);
    expect(
      proposalMatchesReview(restored!.proposals, "change-0", {
        field: "first_message",
        value: "Tampered value",
      }),
    ).toBe(false);
  });

  it("rejects malformed metadata instead of restoring an unsafe card", () => {
    expect(readStoredStudioMessageMetadata({ proposals: { changes: [{}] } })).toBeNull();
    expect(
      readStoredStudioMessageMetadata({
        proposals: { changes: [change], toolToggles: [], actions: [] },
        savedProposalKeys: ["change-unknown"],
      }),
    ).toBeNull();
    expect(storedStudioMessageMetadata({ changes: [], toolToggles: [], actions: [] })).toBeNull();
  });

  it("recognizes only legacy replies that claim a reviewable draft", () => {
    expect(claimsStudioReview("I've drafted the updated rule. Approve it when ready.")).toBe(true);
    expect(claimsStudioReview("I can draft a rule when you tell me what to change.")).toBe(false);
  });
});
