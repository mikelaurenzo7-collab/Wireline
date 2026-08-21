import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("server-owned OpenAI Realtime call control", () => {
  it("never returns a provider credential and fails closed without durable hangup", () => {
    const control = read("src/lib/voice/openai-realtime-call-control.ts");
    const creation = control.slice(
      control.indexOf("export async function createServerManagedOpenAIRealtimeCall"),
    );
    expect(control).toContain("realtime/client_secrets");
    expect(creation).toContain('"Content-Type": "application/sdp"');
    expect(creation).toContain('response.headers.get("location")');
    expect(creation).toContain("scheduleAuthoritativeHangup");
    expect(creation).toContain("hangupOpenAIRealtimeCall");
    expect(creation).toContain("Live voice safety controls are temporarily unavailable");
    expect(creation).toContain("return { sdp: answer, callId, maxDurationSeconds: duration }");
    expect(creation).not.toMatch(/return\s*\{[^}]*ephemeralKey/s);
  });

  it("makes provider hangup retry-safe and dispatches it outside provider spend gates", () => {
    const control = read("src/lib/voice/openai-realtime-call-control.ts");
    const queue = read("src/lib/job-queue.ts");
    const worker = read("src/lib/job-worker.ts");
    expect(control).toContain("response.status === 404 || response.status === 409");
    expect(control).toContain('type: "openai_realtime_hangup"');
    expect(queue).toContain('"openai_realtime_hangup"');
    const dispatch = worker.slice(worker.indexOf("async function dispatchJob"));
    expect(dispatch.indexOf('job.type === "openai_realtime_hangup"')).toBeLessThan(
      dispatch.indexOf("assertLaunchProviderSpendAllowed(job)"),
    );
    expect(worker).toContain('"openai_realtime_hangup",');
  });

  it("keeps public admission controls ahead of provider call creation", () => {
    const route = read("src/routes/marketing-runtime-routes.ts");
    const demoCall = route.slice(route.indexOf('"/api/public/demo-call"'));
    expect(demoCall.indexOf("verifyPublicDemoTicket")).toBeLessThan(
      demoCall.indexOf("consumePublicDemoTicket"),
    );
    expect(demoCall.indexOf("consumePublicDemoTicket")).toBeLessThan(
      demoCall.indexOf("admitPublicWebDemoSession"),
    );
    expect(demoCall.indexOf("admitPublicWebDemoSession")).toBeLessThan(
      demoCall.indexOf("createPublicOpenAILiveDemoCall"),
    );
  });

  it("exposes only the browser SDP answer and public deadline", () => {
    const service = read("src/lib/voice/openai-public-demo-session.ts");
    const response = service.slice(service.indexOf("return {", service.indexOf("endsAt")));
    expect(response).toContain("sdp: call.sdp");
    expect(response).toContain("maxDurationSeconds");
    expect(response).toContain("endsAt: endsAt.toISOString()");
    expect(response).not.toContain("callId:");
    expect(response).not.toContain("clientSecret");
    expect(response).not.toContain("token:");
  });
});
