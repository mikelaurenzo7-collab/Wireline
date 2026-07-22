import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIVATION_EVENT_NAMES,
  PRODUCT_EVENT_AUDIENCES,
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_SURFACES,
  PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES,
  SALES_FUNNEL_EVENT_NAMES,
  isProductEventAudience,
  isProductEventName,
  isProductEventSurface,
  makeProductEvent,
} from "../src/lib/product-events";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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
      "outcome_recorded",
      "outcome_reviewed",
      "upgrade_to_paid",
    ]);
  });

  it("locks the eight public self-serve milestones in order", () => {
    expect(PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES).toEqual([
      "signup_started",
      "signup_completed",
      "agent_draft_created",
      "test_call_completed",
      "subscription_checkout_started",
      "phone_number_provision_completed",
      "first_call_completed",
      "outcome_recorded",
    ]);
  });

  it("defines the sales wedge funnel spine", () => {
    expect(SALES_FUNNEL_EVENT_NAMES).toEqual([
      "sales_agent_created",
      "lead_source_added",
      "consent_source_captured",
      "test_call_completed",
      "number_wired",
      "phone_channel_wired",
      "first_sales_call_completed",
      "first_next_action_approved",
      "first_meeting_booked",
    ]);
    for (const name of SALES_FUNNEL_EVENT_NAMES) {
      expect(PRODUCT_EVENT_NAMES).toContain(name);
    }
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
      planId: "starter",
      metadata: { path: "/" },
    });

    expect(event.occurredAt).toEqual(expect.any(String));
    expect(PRODUCT_EVENT_NAMES).toContain(event.event);
    expect(event.audience).toBe("solo_business");
    expect(event.planId).toBe("starter");
  });

  it("emits every activation-spine and wallet milestone from a real product surface", () => {
    const surfaces = [
      read("src/main.tsx"),
      read("src/components/marketing/MarketingHero.tsx"),
      read("src/components/marketing/MarketingStickyCta.tsx"),
      read("src/components/AuthPortal.tsx"),
      read("src/components/CreateAgentDialog.tsx"),
      read("src/components/onboarding/PostCreateActivationWizard.tsx"),
      read("src/components/ConversationBalanceCard.tsx"),
      read("src/components/StripeBillingCard.tsx"),
      read("src/components/ActivationNudge.tsx"),
      read("src/components/CallLogsClaude.tsx"),
      read("src/components/OutboundDialDialog.tsx"),
      read("src/lib/vapi-handlers.ts"),
      read("src/lib/post-call-digest.ts"),
      read("src/routes/billing-routes.ts"),
      read("src/routes/launch-billing-checkout-routes.ts"),
      read("src/routes/carrier-routes.ts"),
    ].join("\n");

    const requiredEmitters = [
      "landing_viewed",
      "landing_primary_cta_clicked",
      "signup_intent_captured",
      "signup_started",
      "signup_completed",
      "agent_draft_created",
      "agent_created",
      "test_call_completed",
      "agent_launch_completed",
      "conversation_balance_checkout_started",
      "subscription_checkout_started",
      "phone_number_provision_completed",
      "first_call_completed",
      "outcome_recorded",
    ] as const;

    for (const eventName of requiredEmitters) {
      expect(surfaces).toContain(`"${eventName}"`);
    }
  });
});
