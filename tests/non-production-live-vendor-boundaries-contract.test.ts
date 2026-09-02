import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function sliceFrom(source: string, marker: string, endMarker?: string): string {
  const start = source.indexOf(marker);
  expect(start, `missing source marker: ${marker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? source.indexOf(endMarker, start + marker.length) : -1;
  return source.slice(start, end >= 0 ? end : undefined);
}

describe("non-production live-vendor mutation boundaries", () => {
  it("blocks tenant OpenAI Realtime calls before lease and provider work", () => {
    const source = read("src/lib/voice/openai-realtime-call-control.ts");
    const create = sliceFrom(
      source,
      "export async function createServerManagedOpenAIRealtimeCall",
      "async function createServerManagedOpenAIRealtimeCallUnfenced",
    );
    const publicBypass = create.indexOf("if (!isTenantCall)");
    const environment = create.indexOf("assertLiveExternalActionAllowed");
    const lease = create.indexOf("runTenantProviderWorkWithDeletionFence");

    expect(publicBypass).toBeGreaterThanOrEqual(0);
    expect(environment).toBeGreaterThan(publicBypass);
    expect(lease).toBeGreaterThan(environment);
    expect(create).toContain('operation: "openai_realtime_call_create"');
    expect(create).toContain("retainOnSuccess: true");
    expect(create).toContain("createServerManagedOpenAIRealtimeCallUnfenced(input)");

    const hangup = sliceFrom(
      source,
      "export async function hangupOpenAIRealtimeCall",
      "async function scheduleAuthoritativeHangup",
    );
    expect(hangup).not.toContain("assertLiveExternalActionAllowed");
  });

  it("keeps public voice preview outside every live-vendor identity", () => {
    const source = read("src/routes/marketing-runtime-routes.ts");
    expect(source).toContain("res.status(410).json");
    expect(source).not.toMatch(
      /OPENAI_REALTIME_SYSTEM_USER_ID|keyPurpose|createPublicOpenAILiveDemoCall|createServerManagedOpenAIRealtimeCall/,
    );
  });

  it("guards both AgentMail connect POSTs while preserving disconnect cleanup", () => {
    const source = read("src/routes/agentmail-routes.ts");
    const managed = sliceFrom(
      source,
      '"/api/agents/:agentId/managed-mailbox"',
      '"/api/integrations/agentmail/connect"',
    );
    const legacy = sliceFrom(
      source,
      '"/api/integrations/agentmail/connect"',
      '"/api/integrations/agentmail/disconnect"',
    );
    const disconnect = sliceFrom(source, '"/api/integrations/agentmail/disconnect"');

    expect(managed.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      managed.indexOf("resolveManagedBotInbox"),
    );
    expect(legacy.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      legacy.indexOf("resolveAgentMailInbox"),
    );
    expect(disconnect).toContain("deleteAgentMailWebhooksForAccount");
    expect(disconnect).not.toContain("assertLiveExternalActionAllowed");
  });

  it("routes uncovered tenant Resend lanes through account-environment policy", () => {
    const email = read("src/lib/email-service.ts");
    const billing = read("src/routes/billing-routes.ts");
    const jobs = read("src/lib/job-worker-base.ts");
    const voicemail = read("src/routes/twilio-webhook-base.ts");
    const notifications = read("src/lib/notifications.ts");

    expect(email).toContain("async function tenantEmailPolicyBlock");
    expect(email).toContain("liveExternalActionPolicyForUser(userId)");
    expect(email).toContain("export async function sendTenantEmail");
    expect(billing).toMatch(/sendPaymentFailedEmail\(\{\s*userId: row\.userId,/);
    expect(jobs).toMatch(/sendTrialEndingSoonEmail\(\{\s*userId: p\.userId,/);
    expect(notifications).toMatch(/sendUrgentEscalationEmail\(\{\s*userId: this\.userId,/);
    expect(voicemail).toContain("sendTenantEmail");
    expect(voicemail).toContain("userId: tenantUserId");
    expect(voicemail).toContain('action: "voicemail_failover_owner_notification"');
  });

  it("does not put account-environment gates on auth or platform funnel mail", () => {
    const email = read("src/lib/email-service.ts");
    const reset = sliceFrom(
      email,
      "export async function sendPasswordResetEmail",
      "export async function sendEmailVerification",
    );
    const verify = sliceFrom(
      email,
      "export async function sendEmailVerification",
      "export async function sendUrgentEscalationEmail",
    );
    expect(reset).not.toContain("tenantEmailPolicyBlock");
    expect(verify).not.toContain("tenantEmailPolicyBlock");
    expect(read("src/lib/demo-funnel.ts")).toContain('import("./email-service")');
  });
});
