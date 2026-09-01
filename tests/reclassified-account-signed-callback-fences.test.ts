import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { metaTenantExternalIngestAllowed } from "../src/routes/meta-webhook-routes";
import { tenantWebhookExternalActionsAllowed } from "../src/lib/webhook-helpers";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("reclassified-account signed callback fences", () => {
  it.each(["demo", "test"] as const)(
    "stops Meta provider fetch and PII ingest for a %s tenant",
    async (environment) => {
      const providerFetch = vi.fn();
      const persistPii = vi.fn();
      const allowed = await metaTenantExternalIngestAllowed(
        "tenant-1",
        vi.fn().mockResolvedValue({
          allowed: false,
          environment,
          status: 403,
          code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
          message: "Live external actions are disabled.",
        }),
      );
      if (allowed) {
        await providerFetch();
        await persistPii();
      }
      expect(allowed).toBe(false);
      expect(providerFetch).not.toHaveBeenCalled();
      expect(persistPii).not.toHaveBeenCalled();
    },
  );

  it("fails Meta ingest closed when tenant classification cannot be read", async () => {
    const providerFetch = vi.fn();
    const allowed = await metaTenantExternalIngestAllowed(
      "tenant-1",
      vi.fn().mockRejectedValue(new Error("database unavailable")),
    );
    if (allowed) await providerFetch();
    expect(allowed).toBe(false);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("does not deliver queued tenant webhooks after demo/test reclassification", async () => {
    const postWebhook = vi.fn();
    const policy = await tenantWebhookExternalActionsAllowed(
      "tenant-1",
      vi.fn().mockResolvedValue({
        allowed: false,
        environment: "demo",
        status: 403,
        code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
        message: "Live external actions are disabled.",
      }),
    );
    if (policy.allowed) await postWebhook();
    expect(policy).toMatchObject({
      allowed: false,
      code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
    });
    expect(postWebhook).not.toHaveBeenCalled();
  });

  it("gates new and queued tenant webhook work at the shared network boundary", () => {
    const source = read("src/lib/webhook-helpers.ts");
    const attempt = source.slice(
      source.indexOf("async function attemptWebhookDeliveryAfterDeletionFence"),
      source.indexOf("export async function dispatchWebhook"),
    );
    expect(attempt.indexOf("tenantWebhookExternalActionsAllowed(")).toBeLessThan(
      attempt.indexOf("postWebhookSafely("),
    );
    expect(attempt).toContain("blocked_${externalActionPolicy.code.toLowerCase()}");

    const dispatch = source.slice(
      source.indexOf("async function dispatchWebhookAfterDeletionFence"),
      source.indexOf("export async function dispatchWebhook"),
    );
    expect(dispatch.indexOf("tenantWebhookExternalActionsAllowed(userId)")).toBeLessThan(
      dispatch.indexOf(".insert(schema.webhookDeliveries)"),
    );
  });

  it("gates the signed Meta lead after tenant resolution and before Graph/PII work", () => {
    const source = read("src/routes/meta-webhook-routes.ts");
    const post = source.slice(source.indexOf('router.post("/api/webhooks/meta/leads"'));
    const signature = post.indexOf("verifyMetaSignature(rawBody, sig)");
    const tenant = post.indexOf("resolveTenantForPage(pageId)");
    const environment = post.indexOf("metaTenantExternalIngestAllowed(tenant.userId)");
    const remoteFetch = post.indexOf("fetchMetaLead(leadgenId, tenant.accessToken)");
    const piiInsert = post.indexOf(".insert(schema.outboundLeads)");

    expect(signature).toBeGreaterThanOrEqual(0);
    expect(tenant).toBeGreaterThan(signature);
    expect(environment).toBeGreaterThan(tenant);
    expect(remoteFetch).toBeGreaterThan(environment);
    expect(piiInsert).toBeGreaterThan(remoteFetch);
  });

  it("hard-hangups reclassified outbound bridge replays before state or TwiML", () => {
    const source = read("src/routes/openai-outbound-routes.ts");
    const resolver = source.slice(
      source.indexOf("async function resolveBridgeContext"),
      source.indexOf('router.post(\n  "/api/twilio-webhook/openai-outbound-bridge"'),
    );
    const placement = resolver.indexOf("openAIOutboundPlacementMatches");
    const environment = resolver.indexOf("liveExternalActionPolicy(");
    const replay = resolver.indexOf("resolveOpenAIOutboundTwiMLReplay({");
    const stateWrite = resolver.indexOf("amdNativeVoice.state");
    expect(placement).toBeGreaterThanOrEqual(0);
    expect(environment).toBeGreaterThan(placement);
    expect(replay).toBeGreaterThan(environment);
    expect(stateWrite).toBeGreaterThan(replay);
    expect(resolver).toMatch(
      /replay\?\.kind === "voicemail"[\s\S]*Preserve that stored decision as historical evidence[\s\S]*return \{ kind: "drop", answeredBy: replay\.answeredBy/,
    );

    const bridgeRoute = source.slice(
      source.indexOf('"/api/twilio-webhook/openai-outbound-bridge"'),
      source.indexOf('"/api/twilio-webhook/openai-outbound-fallback"'),
    );
    const decision = bridgeRoute.indexOf('decision.kind === "hangup"');
    const meter = bridgeRoute.indexOf(
      "await meterNativeCarrierAttempt(decision.userId, callSid)",
      decision,
    );
    const hangup = bridgeRoute.indexOf("send(emptyTwiml())", decision);
    const bridge = bridgeRoute.indexOf("send(bridgeTwiml", decision);
    expect(decision).toBeGreaterThanOrEqual(0);
    expect(meter).toBeGreaterThan(decision);
    expect(hangup).toBeGreaterThan(meter);
    expect(bridge).toBeGreaterThan(hangup);
    expect(bridgeRoute).not.toContain("voicemailTwiml");
  });

  it("keeps the authenticated status callback while making fallback Hangup-only", () => {
    const source = read("src/routes/openai-outbound-routes.ts");
    const fallback = source.slice(
      source.indexOf('"/api/twilio-webhook/openai-outbound-fallback"'),
      source.indexOf('"/api/twilio-webhook/openai-outbound-status"'),
    );
    expect(fallback).toContain("evaluateTwilioWebhookAuth(req)");
    expect(fallback).toContain("verifyOpenAIOutboundToken");
    expect(fallback).toContain("send(emptyTwiml())");
    expect(fallback).not.toContain("voicemailTwiml(");
    expect(fallback).not.toContain("<Say>");
    expect(fallback).not.toContain("<Dial");

    const status = source.slice(source.indexOf('"/api/twilio-webhook/openai-outbound-status"'));
    expect(status).toContain("evaluateTwilioWebhookAuth(req)");
    expect(status).toContain("verifyOpenAIOutboundToken(token)");
    expect(status).toContain("carrier_status_last_seen");
    expect(status).toContain(".update(schema.outboundLeads)");
  });
});
