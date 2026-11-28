import { describe, expect, it } from "vitest";

import { shouldDispatchProductEvent } from "../src/lib/product-event-client";

describe("activation milestone truth", () => {
  it("counts launch readiness only once training was actually saved", () => {
    // Skipping a question in Bo's first conversation is not readiness.
    expect(
      shouldDispatchProductEvent({
        event: "launch_readiness_reached",
        metadata: { source: "bo_onboarding" },
      }),
    ).toBe(false);
    expect(
      shouldDispatchProductEvent({
        event: "launch_readiness_reached",
        metadata: { source: "bo_onboarding", has_training: true },
      }),
    ).toBe(true);
  });

  it("requires a wired line and an initiated test before launch completion", () => {
    expect(
      shouldDispatchProductEvent({
        event: "agent_launch_completed",
        metadata: { has_line: false, test_started: false },
      }),
    ).toBe(false);
    expect(
      shouldDispatchProductEvent({
        event: "agent_launch_completed",
        metadata: { has_line: true, test_started: false },
      }),
    ).toBe(false);
    expect(
      shouldDispatchProductEvent({
        event: "agent_launch_completed",
        metadata: { has_line: false, test_started: true },
      }),
    ).toBe(false);
    expect(
      shouldDispatchProductEvent({
        event: "agent_launch_completed",
        metadata: { has_line: true, test_started: true },
      }),
    ).toBe(true);
  });

  it("requires an explicit user action before an outcome counts as reviewed", () => {
    expect(
      shouldDispatchProductEvent({
        event: "outcome_reviewed",
        metadata: { source: "call_ops", call_id: "call_123" },
      }),
    ).toBe(false);
    expect(
      shouldDispatchProductEvent({
        event: "outcome_reviewed",
        metadata: {
          source: "outcome_ledger_evidence",
          call_id: "call_123",
          reviewed: true,
        },
      }),
    ).toBe(true);
  });

  it("leaves unrelated product events unchanged", () => {
    expect(
      shouldDispatchProductEvent({
        event: "agent_created",
        metadata: { source: "bo_onboarding" },
      }),
    ).toBe(true);
  });
});
