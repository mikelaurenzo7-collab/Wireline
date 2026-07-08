import { describe, expect, it } from "vitest";
import {
  ACTIVATION_EVENT_NAMES,
  PRODUCT_EVENT_AUDIENCES,
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_SURFACES,
  isProductEventAudience,
  isProductEventName,
  isProductEventSurface,
  makeProductEvent,
} from "../src/lib/product-events";

describe("product event taxonomy", () => {
  it("keeps the activation spine explicit and ordered", () => {
    expect(ACTIVATION_EVENT_NAMES).toEqual([
      "landing_viewed",
      "landing_primary_cta_clicked",
      "signup_intent_captured",
      "signup_started",
      "signup_completed",
      "agent_draft_created",
      "agent_created",
      "training_asset_added",
      "launch_readiness_reached",
      "post_create_wizard_step_completed",
      "first_test_call_started",
      "test_call_completed",
      "wire_started",
      "phone_channel_wired",
      "agent_launch_completed",
      "first_call_completed",
      "live_call_completed",
      "outcome_reviewed",
      "upgrade_to_paid",
    ]);
  });

  it("covers the current audience and surface model", () => {
    expect(PRODUCT_EVENT_AUDIENCES).toEqual([
      "personal",
      "solo_business",
      "team_smb",
      "sales",
      "call_center",
      "enterprise",
    ]);
    expect(PRODUCT_EVENT_SURFACES).toEqual([
      "marketing_web",
      "web_workspace",
      "browser_extension",
      "ios",
      "android",
      "chatgpt_app",
      "claude_app",
      "api",
    ]);
  });

  it("validates event names, audiences, and surfaces", () => {
    expect(isProductEventName("agent_draft_created")).toBe(true);
    expect(isProductEventName("agent_created")).toBe(true);
    expect(isProductEventName("post_create_wizard_step_completed")).toBe(true);
    expect(isProductEventName("first_test_call_started")).toBe(true);
    expect(isProductEventName("phone_channel_wired")).toBe(true);
    expect(isProductEventName("outcome_reviewed")).toBe(true);
    expect(isProductEventName("first_call_completed")).toBe(true);
    expect(isProductEventName("upgrade_to_paid")).toBe(true);
    expect(isProductEventName("agent_created_eventually")).toBe(false);
    expect(isProductEventAudience("solo_business")).toBe(true);
    expect(isProductEventAudience("solo business")).toBe(false);
    expect(isProductEventSurface("chatgpt_app")).toBe(true);
    expect(isProductEventSurface("chatgpt")).toBe(false);
  });

  it("creates timestamped events without mutating the taxonomy", () => {
    const event = makeProductEvent({
      event: "landing_viewed",
      audience: "solo_business",
      surface: "marketing_web",
      metadata: { path: "/" },
    });

    expect(event.occurredAt).toEqual(expect.any(String));
    expect(PRODUCT_EVENT_NAMES).toContain(event.event);
    expect(event.audience).toBe("solo_business");
  });
});
