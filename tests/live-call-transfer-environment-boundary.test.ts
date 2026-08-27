import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
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
    const transfer = route.indexOf("await transferLiveCall");

    expect(environment).toBeGreaterThan(-1);
    expect(presence).toBeGreaterThan(environment);
    expect(entity).toBeGreaterThan(presence);
    expect(transfer).toBeGreaterThan(entity);
    expect(route).toContain("transferLiveCall(req.user.id, presence.controlUrl, destination)");
  });

  it("checks native mobile before claiming presence and rechecks inside REFER", () => {
    const route = handoffRoute(read("src/routes/native-mobile-voice-routes.ts"));
    const environment = route.indexOf("await assertLiveExternalActionAllowed");
    const entity = route.indexOf("await assertExternalEntityActionAllowed");
    const claim = route.indexOf('.set({ status: "transferring" })');
    const refer = route.indexOf("await referXAISipCall");

    expect(environment).toBeGreaterThan(-1);
    expect(entity).toBeGreaterThan(environment);
    expect(claim).toBeGreaterThan(entity);
    expect(refer).toBeGreaterThan(claim);
    expect(route).toContain("referXAISipCall(req.user.id, callId, normalizedDestination)");
  });

  it("rechecks the tenant immediately before every xAI REFER, including late completion", () => {
    const session = read("src/lib/voice/xai-sip-session.ts");
    const referBoundary = session.slice(
      session.indexOf("export async function referXAISipCall"),
      session.indexOf("export function hangupXAISipCall"),
    );
    const entity = referBoundary.indexOf("await assertExternalEntityActionAllowed");
    const environment = referBoundary.indexOf("await assertLiveExternalActionAllowed");
    const provider = referBoundary.indexOf('await xaiCallControl(callId, "refer"');

    expect(entity).toBeGreaterThan(-1);
    expect(environment).toBeGreaterThan(entity);
    expect(provider).toBeGreaterThan(environment);
    expect(referBoundary.slice(environment, provider).match(/await /g)).toHaveLength(1);

    expect(session).toContain(
      "referXAISipCall(input.userId, input.callId, result.destination.number)",
    );
    expect(session).toMatch(
      /referXAISipCall\(\s*input\.userId,\s*input\.callId,\s*outcome\.result\.destination\.number/,
    );

    const hangupBoundary = session.slice(
      session.indexOf("export function hangupXAISipCall"),
      session.indexOf("const liveSipSessions"),
    );
    expect(hangupBoundary).toContain('xaiCallControl(callId, "hangup")');
    expect(hangupBoundary).not.toContain("assertLiveExternalActionAllowed");
    expect(hangupBoundary).not.toContain("assertExternalEntityActionAllowed");
  });

  it("rechecks Vapi warm-transfer eligibility after notification and at the final directive", () => {
    const workflow = read("src/routes/vapi/tool-handlers-workflow.ts");
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
