import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

function handoffRoute(source: string): string {
  const marker = 'router.post(\n  "/api/mobile/calls/:callId/handoff"';
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start);
}

describe("live-call transfer environment boundary", () => {
  it("checks the authenticated mobile tenant before reading control state or transferring", () => {
    const route = handoffRoute(read("src/routes/mobile-routes.ts"));
    const environment = route.indexOf("await assertLiveExternalActionAllowed");
    const presence = route.indexOf("schema.signalPresence.controlUrl");
    const entity = route.indexOf("await assertExternalEntityActionAllowed");
    const transfer = route.indexOf("await referOpenAISipCall");

    expect(environment).toBeGreaterThan(-1);
    expect(presence).toBeGreaterThan(environment);
    expect(entity).toBeGreaterThan(presence);
    expect(transfer).toBeGreaterThan(entity);
    expect(route).toContain("referOpenAISipCall(req.user.id, providerCallId, destination)");
  });

  it("rechecks the tenant immediately before every OpenAI REFER, including late completion", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const referBoundary = session.slice(
      session.indexOf("export async function referOpenAISipCall"),
      session.indexOf("export function hangupOpenAISipCall"),
    );
    const entity = referBoundary.indexOf("await assertExternalEntityActionAllowed");
    const environment = referBoundary.indexOf("await assertLiveExternalActionAllowed");
    const provider = referBoundary.indexOf('await openaiCallControl(callId, "refer"');

    expect(entity).toBeGreaterThan(-1);
    expect(environment).toBeGreaterThan(entity);
    expect(provider).toBeGreaterThan(environment);
    expect(referBoundary.slice(environment, provider).match(/await /g)).toHaveLength(1);

    expect(session).toContain(
      "referOpenAISipCall(input.userId, input.callId, result.destination.number)",
    );
    expect(session).toMatch(
      /referOpenAISipCall\(\s*input\.userId,\s*input\.callId,\s*outcome\.result\.destination\.number/,
    );

    const hangupBoundary = session.slice(
      session.indexOf("export function hangupOpenAISipCall"),
      session.indexOf("const liveSipSessions"),
    );
    expect(hangupBoundary).toContain('openaiCallControl(callId, "hangup")');
    expect(hangupBoundary).not.toContain("assertLiveExternalActionAllowed");
    expect(hangupBoundary).not.toContain("assertExternalEntityActionAllowed");
  });

  it("rechecks warm-transfer eligibility after notification and at the final directive", () => {
    const workflow = read("src/lib/bot-tools/workflow.ts");
    const escalation = workflow.slice(workflow.indexOf('if (fn === "escalate_to_human")'));
    const notification = escalation.indexOf("await notifier.sendUrgentAlert");
    const postNotification = escalation.indexOf(
      "const postNotificationBlock = await warmTransferExternalActionBlock",
    );
    const reliability = escalation.indexOf("await recordEscalationOutcome", postNotification);
    const finalCheck = escalation.indexOf(
      "const finalExternalActionBlock = await warmTransferExternalActionBlock",
    );
    const destination = escalation.indexOf("destination: {", finalCheck);

    expect(notification).toBeGreaterThan(-1);
    expect(postNotification).toBeGreaterThan(notification);
    expect(reliability).toBeGreaterThan(postNotification);
    expect(finalCheck).toBeGreaterThan(reliability);
    expect(destination).toBeGreaterThan(finalCheck);
  });
});
