import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  eraseProviderCallArtifacts,
  parseTwilioRecordingRef,
} from "../src/lib/provider-call-erasure";

const ACCOUNT_SID = `AC${"1".repeat(32)}`;
const OTHER_ACCOUNT_SID = `AC${"2".repeat(32)}`;
const RECORDING_SID = `RE${"3".repeat(32)}`;
const CALL_SID = `CA${"4".repeat(32)}`;
const TRANSCRIPTION_SID = `TR${"5".repeat(32)}`;
const VAPI_CALL_ID = "call_01JTESTWIRELINEERASURE";
const RECORDING_URL = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${RECORDING_SID}`;
const RECORDING_METADATA_URL = `${RECORDING_URL}.json?IncludeSoftDeleted=true`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

describe("provider call erasure", () => {
  it("accepts only recording URLs for the configured Twilio account", () => {
    expect(parseTwilioRecordingRef(RECORDING_URL, ACCOUNT_SID)).toEqual({
      accountSid: ACCOUNT_SID,
      recordingSid: RECORDING_SID,
    });

    expect(() => parseTwilioRecordingRef(RECORDING_URL, OTHER_ACCOUNT_SID)).toThrow(
      /different Twilio account/i,
    );
    expect(() =>
      parseTwilioRecordingRef(
        `https://evil.example/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${RECORDING_SID}`,
        ACCOUNT_SID,
      ),
    ).toThrow(/not an authenticated Twilio API URL/i);
  });

  it("deletes Vapi calls plus Twilio transcription, recording, and call-log resources", async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
      if (input === `https://api.vapi.ai/call/${encodeURIComponent(VAPI_CALL_ID)}`) {
        expect(init?.method).toBe("DELETE");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer vapi-test-key");
        return jsonResponse({ id: VAPI_CALL_ID });
      }

      if (input === RECORDING_METADATA_URL && !init?.method) {
        expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
        return jsonResponse({ call_sid: CALL_SID });
      }

      if (
        input ===
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${RECORDING_SID}/Transcriptions.json?PageSize=1000`
      ) {
        return jsonResponse({ transcriptions: [{ sid: TRANSCRIPTION_SID }] });
      }

      if (
        input ===
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Transcriptions/${TRANSCRIPTION_SID}.json`
      ) {
        expect(init?.method).toBe("DELETE");
        return emptyResponse();
      }

      if (input === `${RECORDING_URL}.json` && init?.method === "DELETE") {
        return emptyResponse();
      }

      if (
        input === `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${CALL_SID}.json`
      ) {
        expect(init?.method).toBe("DELETE");
        return emptyResponse();
      }

      throw new Error(`Unexpected provider request: ${init?.method || "GET"} ${input}`);
    });

    const result = await eraseProviderCallArtifacts(
      [
        { vapiCallId: VAPI_CALL_ID, recordingUrl: null },
        { vapiCallId: "twilio-voicemail:hash", recordingUrl: RECORDING_URL },
      ],
      {
        fetchFn,
        env: {
          VAPI_PRIVATE_KEY: "vapi-test-key",
          TWILIO_ACCOUNT_SID: ACCOUNT_SID,
          TWILIO_AUTH_TOKEN: "twilio-test-token",
        },
      },
    );

    expect(result).toEqual({
      vapiCallsDeleted: 1,
      twilioRecordingsDeleted: 1,
      twilioTranscriptionsDeleted: 1,
      twilioCallsDeleted: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("recovers the Call SID from soft-deleted recording metadata after a partial failure", async () => {
    let recordingDeleted = false;
    let callDeleteAttempts = 0;
    const fetchFn = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
      if (input === RECORDING_METADATA_URL && !init?.method) {
        return jsonResponse({
          call_sid: CALL_SID,
          status: recordingDeleted ? "deleted" : "completed",
        });
      }
      if (
        input ===
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${RECORDING_SID}/Transcriptions.json?PageSize=1000`
      ) {
        return emptyResponse(404);
      }
      if (input === `${RECORDING_URL}.json` && init?.method === "DELETE") {
        if (recordingDeleted) return emptyResponse(404);
        recordingDeleted = true;
        return emptyResponse();
      }
      if (
        input === `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${CALL_SID}.json`
      ) {
        callDeleteAttempts++;
        return callDeleteAttempts === 1 ? emptyResponse(500) : emptyResponse();
      }
      throw new Error(`Unexpected provider request: ${init?.method || "GET"} ${input}`);
    });

    const pointers = [{ vapiCallId: "twilio-voicemail:hash", recordingUrl: RECORDING_URL }];
    const options = {
      fetchFn,
      env: {
        TWILIO_ACCOUNT_SID: ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: "twilio-test-token",
      },
    };

    await expect(eraseProviderCallArtifacts(pointers, options)).rejects.toThrow(
      /Twilio call-log deletion failed with HTTP 500/,
    );
    await expect(eraseProviderCallArtifacts(pointers, options)).resolves.toEqual({
      vapiCallsDeleted: 0,
      twilioRecordingsDeleted: 0,
      twilioTranscriptionsDeleted: 0,
      twilioCallsDeleted: 1,
    });
    expect(callDeleteAttempts).toBe(2);
  });

  it("treats provider not-found responses as retry-idempotent", async () => {
    const fetchFn = vi.fn(async (input: string): Promise<Response> => {
      if (input.startsWith("https://api.vapi.ai/call/")) return emptyResponse(404);
      if (input === RECORDING_METADATA_URL) return emptyResponse(404);
      throw new Error(`Unexpected provider request: ${input}`);
    });

    await expect(
      eraseProviderCallArtifacts(
        [
          { vapiCallId: VAPI_CALL_ID, recordingUrl: null },
          { vapiCallId: "twilio-voicemail:hash", recordingUrl: RECORDING_URL },
        ],
        {
          fetchFn,
          env: {
            VAPI_PRIVATE_KEY: "vapi-test-key",
            TWILIO_ACCOUNT_SID: ACCOUNT_SID,
            TWILIO_AUTH_TOKEN: "twilio-test-token",
          },
        },
      ),
    ).resolves.toEqual({
      vapiCallsDeleted: 0,
      twilioRecordingsDeleted: 0,
      twilioTranscriptionsDeleted: 0,
      twilioCallsDeleted: 0,
    });
  });

  it("fails closed so local purge retains cleanup pointers when a provider fails", async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => emptyResponse(500));

    await expect(
      eraseProviderCallArtifacts([{ vapiCallId: VAPI_CALL_ID, recordingUrl: null }], {
        fetchFn,
        env: { VAPI_PRIVATE_KEY: "vapi-test-key" },
      }),
    ).rejects.toThrow(/Vapi call deletion failed with HTTP 500/);
  });

  it("is wired into external cleanup before the local hard-delete engine", () => {
    const deletion = readFileSync(resolve(process.cwd(), "src/lib/account-deletion.ts"), "utf8");
    const providerErasure = deletion.indexOf(
      "await eraseProviderCallArtifacts(callArtifactPointers)",
    );
    const hardDelete = deletion.indexOf("async function purgeAccountOutsideTenantContext");

    expect(providerErasure).toBeGreaterThan(-1);
    expect(hardDelete).toBeGreaterThan(providerErasure);
    expect(deletion).toContain(
      'log.error("provider call-data deletion failed, deferring account purge"',
    );
  });
});
