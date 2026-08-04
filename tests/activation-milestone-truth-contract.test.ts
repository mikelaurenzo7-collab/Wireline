import { describe, expect, it } from "vitest";

import { shouldDispatchProductEvent } from "../src/lib/product-event-client";

describe("activation milestone truth", () => {
  it("does not classify advancing past training as launch readiness", () => {
    expect(
      shouldDispatchProductEvent({
        event: "launch_readiness_reached",
        metadata: { source: "wizard_train_step" },
      }),
    ).toBe(false);

    expect(
      shouldDispatchProductEvent({
        event: "launch_readiness_reached",
        metadata: { source: "server_readiness_check" },
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

  it("leaves unrelated product events unchanged", () => {
    expect(
      shouldDispatchProductEvent({
        event: "agent_created",
        metadata: { source: "post_create_wizard" },
      }),
    ).toBe(true);
  });
});
