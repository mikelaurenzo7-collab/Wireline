import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = read("src/lib/webhook-helpers.ts");

describe("tenant webhook provider deletion fences", () => {
  it("resolves the owner, then fences claim through provider outcome persistence", () => {
    const delivery = source.slice(
      source.indexOf("async function attemptWebhookDeliveryAfterDeletionFence"),
      source.indexOf("async function dispatchWebhookAfterDeletionFence"),
    );
    const exported = source.slice(
      source.indexOf("export async function attemptWebhookDelivery"),
      source.indexOf("async function dispatchWebhookAfterDeletionFence"),
    );

    expect(exported.indexOf("lookupWebhookDeliveryOwner(deliveryIdBig)")).toBeLessThan(
      exported.indexOf("runTenantProviderWorkWithDeletionFence({"),
    );
    expect(exported).toContain('operation: "tenant_webhook_delivery"');
    expect(exported).toContain("outcome.providerAccepted || outcome.providerOutcomeAmbiguous");
    expect(exported).toContain(
      "perform: () => attemptWebhookDeliveryAfterDeletionFence(deliveryIdBig, userId)",
    );

    const owner = delivery.indexOf("lookupWebhookDeliveryOwner(deliveryIdBig)");
    const claim = delivery.indexOf("claimWebhookDelivery(deliveryIdBig)");
    const refetch = delivery.indexOf("drizzle.query.webhookDeliveries.findFirst");
    const post = delivery.indexOf("await postWebhookSafely(");
    const outcome = delivery.indexOf("const persisted = await persistDeliveryOutcome", post);
    expect(owner).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(owner);
    expect(refetch).toBeGreaterThan(claim);
    expect(post).toBeGreaterThan(refetch);
    expect(outcome).toBeGreaterThan(post);
    expect(delivery).toContain("confirmedUserId !== expectedUserId");
    expect(delivery).toContain("deliveryWithHook.userId !== confirmedUserId");
  });

  it("retains acknowledged and ambiguous sends but releases pre-provider blocks", () => {
    const delivery = source.slice(
      source.indexOf("async function attemptWebhookDeliveryAfterDeletionFence"),
      source.indexOf("export async function attemptWebhookDelivery"),
    );

    expect(delivery).toContain("providerAccepted = response.ok");
    expect(delivery).toContain("providerOutcomeAmbiguous = !response.ok");
    expect(delivery).toContain(
      'providerOutcomeAmbiguous = true;\n    lastError = "request_failed"',
    );
    expect(delivery).toContain("return NO_WEBHOOK_PROVIDER_OUTCOME");
  });

  it("fences dispatch before endpoint lookup, receipt insertion, and nested attempts", () => {
    const helper = source.slice(
      source.indexOf("async function dispatchWebhookAfterDeletionFence"),
      source.indexOf("export async function dispatchWebhook"),
    );
    const exported = source.slice(
      source.indexOf("export async function dispatchWebhook"),
      source.indexOf("export async function processWebhookRetries"),
    );

    expect(exported).toContain("runTenantProviderWorkWithDeletionFence({");
    expect(exported).toContain('operation: "tenant_webhook_dispatch"');
    expect(exported).toContain(
      "perform: () => dispatchWebhookAfterDeletionFence(userId, event, data)",
    );
    expect(helper.indexOf("tenantWebhookExternalActionsAllowed(userId)")).toBeLessThan(
      helper.indexOf(".insert(schema.webhookDeliveries)"),
    );
    expect(helper.indexOf(".insert(schema.webhookDeliveries)")).toBeLessThan(
      helper.indexOf("attemptWebhookDelivery(delivery.id)"),
    );
  });

  it("keeps webhook receipts inside the existing terminal purge inventory", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain(
      '{ table: "wireline_webhook_deliveries", userColumns: ["user_id"] }',
    );
    expect(deletion).toContain('{ table: "wireline_webhooks", userColumns: ["user_id"] }');
  });
});
