import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callLogs = readFileSync("src/components/CallLogsClaude.tsx", "utf8");
const recordingRoute = readFileSync("src/routes/call-recording-routes.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard-routes.ts", "utf8");

describe("call recording playback contract", () => {
  it("plays recordings inline in the call report instead of only linking out", () => {
    expect(callLogs).toContain("<audio");
    expect(callLogs).toContain("controls");
    // preload="none" keeps the rate-limited recording endpoint untouched
    // until the user actually presses play.
    expect(callLogs).toContain('preload="none"');
    expect(callLogs).toContain("src={selected.recording_url}");
    // The player remounts per call so one call's playback position and
    // loaded media never carry into the next selected call.
    expect(callLogs).toContain("key={selected.id}");
  });

  it("flags calls that have a recording in the call list", () => {
    expect(callLogs).toContain("call.recording_url");
    expect(callLogs).toContain("<Mic");
  });

  it("points playback only at the tenant-gated BotBound recording route", () => {
    // The list/detail API swaps the stored provider URL for the app route;
    // the raw Twilio media URL never reaches the client.
    expect(dashboard).toContain("`/api/calls/${String(call.id)}/recording`");
    expect(recordingRoute).toContain("authenticateUser");
    expect(recordingRoute).toContain("eq(schema.callLogs.userId, req.user.id)");
  });
});
