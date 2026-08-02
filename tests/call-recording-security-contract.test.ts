import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/call-recording-routes.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard-routes.ts", "utf8");
const mobile = readFileSync("src/routes/mobile-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const twilioWebhook = readFileSync("src/routes/twilio-webhook-base.ts", "utf8");

describe("call recording access contract", () => {
  it("checks tenant ownership before asking a provider for media", () => {
    expect(route).toContain('"/api/calls/:callId/recording"');
    expect(route).toContain("authenticateUser");
    expect(route).toContain("eq(schema.callLogs.userId, req.user.id)");
    expect(route).toContain('"Cache-Control", "private, no-store, max-age=0"');
    expect(route).toContain("/mono-recording");
    expect(route).toContain("VAPI_PRIVATE_KEY");
    expect(route).toContain("TWILIO_AUTH_TOKEN");
  });

  it("returns Wireline recording routes instead of persistent vendor URLs", () => {
    expect(dashboard).toContain("`/api/calls/${String(call.id)}/recording`");
    expect(mobile).toContain("`/api/calls/${String(call.id)}/recording`");
    expect(twilioWebhook).toContain(
      "Never email the persistent Twilio media URL",
    );
    expect(registry).toContain("app.use(callRecordingRouter)");
  });
});
