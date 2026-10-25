import { describe, expect, it } from "vitest";
import {
  AGENT_TEMPLATES,
  LAUNCH_AGENT_TEMPLATES,
  getTemplateSelfServeRestriction,
  isTemplateSelfServeAvailable,
} from "../src/components/AgentTemplates";
import { validateAgentRoleForCreate } from "../src/lib/agent-role-definitions";
import { resolveCreateFirstMessage } from "../src/lib/agent-create-defaults";

function template(id: string) {
  const match = AGENT_TEMPLATES.find((candidate) => candidate.id === id);
  expect(match, `Missing template: ${id}`).toBeDefined();
  return match!;
}

describe("agent template launch truth", () => {
  it("offers sales, marketing, inbound and personal starters while deferring collections", () => {
    const launchIds = new Set<string>(LAUNCH_AGENT_TEMPLATES.map((candidate) => candidate.id));
    for (const id of ["collections-soft", "collections-hard"]) {
      expect(template(id)).toBeDefined();
      expect(launchIds.has(id)).toBe(false);
    }
    for (const id of [
      "sales-sdr",
      "sales-closer",
      "marketing-reengagement",
      "marketing-survey",
      "support-tier1",
      "support-email",
      "personal-errand",
      "personal-negotiator",
    ]) {
      expect(launchIds.has(id)).toBe(true);
    }
    expect(template("scheduler-realestate").firstMessage).toContain("Thanks for calling");
  });

  it("keeps healthcare scheduling visible but unavailable for self-serve deployment", () => {
    const medical = template("scheduler-medical");
    const restriction = getTemplateSelfServeRestriction(medical);

    expect(isTemplateSelfServeAvailable(medical)).toBe(false);
    expect(restriction).toContain("Self-serve deployment is unavailable");
    expect(restriction).toContain("signed BAA");
    expect(restriction).toContain("approved BotBound configuration");
  });

  it("describes only shared commerce lookups and provider-specific checkout behavior", () => {
    const support = template("ecommerce-support");
    const phoneOrder = template("ecommerce-phone-order");

    expect(support.name).toBe("Connected Store Support");
    expect(support.description).toContain("Answers store questions from your Knowledge");
    expect(support.description).toContain("captures requests");
    expect(support.description).toContain("Looks up orders, customers, and inventory");
    expect(support.description).toContain("when Shopify or Square is connected");
    expect(support.description).not.toMatch(/returns|address changes|discount codes/i);
    expect(support.firstMessage).not.toMatch(/returns|address changes|discount codes/i);
    expect(support.firstMessage).toContain("take details for follow up");
    expect(support.firstMessage).not.toMatch(/look up your order|current inventory/i);

    expect(phoneOrder.description).toContain("captures order details");
    expect(phoneOrder.description).toContain("Square payment links");
    expect(phoneOrder.description).toContain("Shopify draft order checkout links");
    expect(phoneOrder.description).toContain("matching provider is connected");
    expect(phoneOrder.description).not.toMatch(/applies discounts|address corrections|all live/i);
    expect(phoneOrder.firstMessage).toContain("take your order details");
    expect(phoneOrder.firstMessage).not.toContain("secure checkout link");
  });

  it("qualifies CRM updates while keeping standalone sales follow-up useful", () => {
    const sales = template("sales-sdr");
    expect(sales.description).toContain("books demos, and records the outcome");
    expect(sales.description).toContain("Updates your CRM when connected");
  });

  it("uses FDCPA-aware guidance without presenting BotBound as a compliance certifier", () => {
    const reminders = template("collections-soft");
    const collections = template("collections-hard");
    const visibleCopy = [collections.description, collections.badge].join(" ");
    const reminderRestriction = getTemplateSelfServeRestriction(reminders);
    const restriction = getTemplateSelfServeRestriction(collections);

    expect(visibleCopy).toContain("FDCPA aware");
    expect(visibleCopy).toMatch(/legal review/i);
    expect(visibleCopy).not.toMatch(/FDCPA compliant|compliant with FDCPA/i);
    expect(collections.firstMessage).not.toMatch(/protect your credit/i);
    expect(isTemplateSelfServeAvailable(reminders)).toBe(false);
    expect(reminderRestriction).toContain("Payment-reminder use requires legal review");
    expect(isTemplateSelfServeAvailable(collections)).toBe(false);
    expect(restriction).toContain("Self-serve deployment is unavailable");
    expect(restriction).toContain("jurisdiction-specific");
  });

  it("leaves ordinary templates available for self-serve deployment", () => {
    const support = template("support-tier1");

    expect(getTemplateSelfServeRestriction(support)).toBeNull();
    expect(isTemplateSelfServeAvailable(support)).toBe(true);
  });

  it("gives every self-serve template a server-accepted canonical role", () => {
    for (const candidate of AGENT_TEMPLATES.filter(isTemplateSelfServeAvailable)) {
      expect(validateAgentRoleForCreate(candidate.role), candidate.id).toBeNull();
    }
    expect(validateAgentRoleForCreate(template("ecommerce-support").role)).toBeNull();
    expect(validateAgentRoleForCreate(template("ecommerce-phone-order").role)).toBeNull();
  });

  it("ships every template with a deployable, token-free greeting", () => {
    for (const candidate of AGENT_TEMPLATES) {
      expect(candidate.firstMessage, candidate.id).not.toMatch(/\[[^\]]+\]|\{\{?[^{}]+\}\}?/);
      expect(candidate.firstMessage, candidate.id).not.toMatch(/\bAlex\b/);
      expect(resolveCreateFirstMessage(candidate.firstMessage, "Taylor"), candidate.id).toBe(
        candidate.firstMessage,
      );
    }

    expect(resolveCreateFirstMessage("Hi [Company]", "Taylor")).toBe(
      "Hi, this is Taylor. How can I help?",
    );
  });
});
