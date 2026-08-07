type CallArtifactPointer = {
  vapiCallId: string | null;
  recordingUrl: string | null;
};

type ProviderFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProviderCallErasureOptions {
  fetchFn?: ProviderFetch;
  env?: NodeJS.ProcessEnv;
}

export interface ProviderCallErasureSummary {
  vapiCallsDeleted: number;
  twilioRecordingsDeleted: number;
  twilioTranscriptionsDeleted: number;
  twilioCallsDeleted: number;
}

type TwilioRecordingRef = {
  accountSid: string;
  recordingSid: string;
};

type TwilioRecordingMetadata = {
  call_sid?: string | null;
};

type TwilioTranscriptionList = {
  transcriptions?: Array<{ sid?: string | null }>;
};

const VAPI_BASE_URL = "https://api.vapi.ai";
const TWILIO_API_ORIGIN = "https://api.twilio.com";
const TWILIO_VOICEMAIL_PREFIX = "twilio-voicemail:";
const TWILIO_ACCOUNT_SID_RE = /^AC[0-9a-fA-F]{32}$/;
const TWILIO_RECORDING_SID_RE = /^RE[0-9a-fA-F]{32}$/;
const TWILIO_CALL_SID_RE = /^CA[0-9a-fA-F]{32}$/;
const TWILIO_TRANSCRIPTION_SID_RE = /^TR[0-9a-fA-F]{32}$/;

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required to erase provider call data.`);
  return value;
}

function alreadyGone(status: number): boolean {
  return status === 404 || status === 410;
}

function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function twilioResourceUrl(accountSid: string, resource: string): string {
  return `${TWILIO_API_ORIGIN}/2010-04-01/Accounts/${accountSid}/${resource}`;
}

export function parseTwilioRecordingRef(
  recordingUrl: string,
  expectedAccountSid: string,
): TwilioRecordingRef {
  if (!TWILIO_ACCOUNT_SID_RE.test(expectedAccountSid)) {
    throw new Error("TWILIO_ACCOUNT_SID is not a valid Twilio Account SID.");
  }

  let url: URL;
  try {
    url = new URL(recordingUrl);
  } catch {
    throw new Error("Stored Twilio recording URL is invalid; deferring account purge.");
  }

  if (url.protocol !== "https:" || url.hostname !== "api.twilio.com") {
    throw new Error("Stored Twilio recording URL is not an authenticated Twilio API URL.");
  }

  const match = url.pathname.match(
    /^\/2010-04-01\/Accounts\/(AC[0-9a-fA-F]{32})\/Recordings\/(RE[0-9a-fA-F]{32})(?:\.(?:json|mp3|wav))?$/,
  );
  if (!match) {
    throw new Error("Stored Twilio recording URL cannot be mapped to a Recording resource.");
  }

  const [, accountSid, recordingSid] = match;
  if (accountSid !== expectedAccountSid) {
    throw new Error("Stored Twilio recording belongs to a different Twilio account.");
  }

  return { accountSid, recordingSid };
}

async function readJson<T>(response: Response, context: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${context} returned malformed JSON; deferring account purge.`);
  }
}

async function eraseVapiCalls(
  pointers: readonly CallArtifactPointer[],
  fetchFn: ProviderFetch,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const callIds = new Set(
    pointers
      .map(({ vapiCallId }) => vapiCallId?.trim() || "")
      .filter(
        (callId) =>
          callId.length > 0 && callId !== "unknown" && !callId.startsWith(TWILIO_VOICEMAIL_PREFIX),
      ),
  );
  if (!callIds.size) return 0;

  const privateKey = requiredEnv(env, "VAPI_PRIVATE_KEY");
  let deleted = 0;
  for (const callId of callIds) {
    const response = await fetchFn(`${VAPI_BASE_URL}/call/${encodeURIComponent(callId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      deleted++;
      continue;
    }
    if (alreadyGone(response.status)) continue;
    throw new Error(
      `Vapi call deletion failed with HTTP ${response.status}; deferring account purge.`,
    );
  }
  return deleted;
}

async function eraseTwilioRecording(
  recordingUrl: string,
  fetchFn: ProviderFetch,
  accountSid: string,
  authToken: string,
): Promise<{
  recordingDeleted: number;
  transcriptionsDeleted: number;
  callDeleted: number;
}> {
  const { recordingSid } = parseTwilioRecordingRef(recordingUrl, accountSid);
  const auth = twilioAuthHeader(accountSid, authToken);
  const recordingResource = twilioResourceUrl(accountSid, `Recordings/${recordingSid}.json`);
  // Twilio keeps deleted Recording metadata for 40 days, but only returns it
  // when IncludeSoftDeleted is requested. The Call SID lives in that metadata.
  // Retaining access to it makes retries safe when media deletion succeeded but
  // the later Call-record deletion failed on the previous purge attempt.
  const recordingMetadataResource = `${recordingResource}?IncludeSoftDeleted=true`;

  const metadataResponse = await fetchFn(recordingMetadataResource, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(15_000),
  });
  if (alreadyGone(metadataResponse.status)) {
    return { recordingDeleted: 0, transcriptionsDeleted: 0, callDeleted: 0 };
  }
  if (!metadataResponse.ok) {
    throw new Error(
      `Twilio recording lookup failed with HTTP ${metadataResponse.status}; deferring account purge.`,
    );
  }
  const metadata = await readJson<TwilioRecordingMetadata>(metadataResponse, "Twilio recording lookup");
  const callSid = metadata.call_sid?.trim() || "";
  if (callSid && !TWILIO_CALL_SID_RE.test(callSid)) {
    throw new Error("Twilio recording metadata returned an invalid Call SID.");
  }

  const transcriptionListResponse = await fetchFn(
    twilioResourceUrl(
      accountSid,
      `Recordings/${recordingSid}/Transcriptions.json?PageSize=1000`,
    ),
    {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!transcriptionListResponse.ok && !alreadyGone(transcriptionListResponse.status)) {
    throw new Error(
      `Twilio transcription lookup failed with HTTP ${transcriptionListResponse.status}; deferring account purge.`,
    );
  }

  let transcriptionsDeleted = 0;
  if (transcriptionListResponse.ok) {
    const list = await readJson<TwilioTranscriptionList>(
      transcriptionListResponse,
      "Twilio transcription lookup",
    );
    const transcriptionSids = new Set(
      (list.transcriptions || [])
        .map(({ sid }) => sid?.trim() || "")
        .filter((sid) => TWILIO_TRANSCRIPTION_SID_RE.test(sid)),
    );
    for (const transcriptionSid of transcriptionSids) {
      const deleteResponse = await fetchFn(
        twilioResourceUrl(accountSid, `Transcriptions/${transcriptionSid}.json`),
        {
          method: "DELETE",
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (deleteResponse.ok) {
        transcriptionsDeleted++;
      } else if (!alreadyGone(deleteResponse.status)) {
        throw new Error(
          `Twilio transcription deletion failed with HTTP ${deleteResponse.status}; deferring account purge.`,
        );
      }
    }
  }

  const recordingDeleteResponse = await fetchFn(recordingResource, {
    method: "DELETE",
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(15_000),
  });
  let recordingDeleted = 0;
  if (recordingDeleteResponse.ok) {
    recordingDeleted = 1;
  } else if (!alreadyGone(recordingDeleteResponse.status)) {
    throw new Error(
      `Twilio recording deletion failed with HTTP ${recordingDeleteResponse.status}; deferring account purge.`,
    );
  }

  let callDeleted = 0;
  if (callSid) {
    const callDeleteResponse = await fetchFn(
      twilioResourceUrl(accountSid, `Calls/${callSid}.json`),
      {
        method: "DELETE",
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (callDeleteResponse.ok) {
      callDeleted = 1;
    } else if (!alreadyGone(callDeleteResponse.status)) {
      throw new Error(
        `Twilio call-log deletion failed with HTTP ${callDeleteResponse.status}; deferring account purge.`,
      );
    }
  }

  return { recordingDeleted, transcriptionsDeleted, callDeleted };
}

async function eraseTwilioVoicemails(
  pointers: readonly CallArtifactPointer[],
  fetchFn: ProviderFetch,
  env: NodeJS.ProcessEnv,
): Promise<{
  recordingsDeleted: number;
  transcriptionsDeleted: number;
  callsDeleted: number;
}> {
  const recordingUrls = new Set(
    pointers
      .filter(({ vapiCallId }) => vapiCallId?.startsWith(TWILIO_VOICEMAIL_PREFIX))
      .map(({ recordingUrl }) => recordingUrl?.trim() || "")
      .filter(Boolean),
  );
  if (!recordingUrls.size) {
    return { recordingsDeleted: 0, transcriptionsDeleted: 0, callsDeleted: 0 };
  }

  const accountSid = requiredEnv(env, "TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv(env, "TWILIO_AUTH_TOKEN");
  let recordingsDeleted = 0;
  let transcriptionsDeleted = 0;
  let callsDeleted = 0;

  for (const recordingUrl of recordingUrls) {
    const result = await eraseTwilioRecording(recordingUrl, fetchFn, accountSid, authToken);
    recordingsDeleted += result.recordingDeleted;
    transcriptionsDeleted += result.transcriptionsDeleted;
    callsDeleted += result.callDeleted;
  }

  return { recordingsDeleted, transcriptionsDeleted, callsDeleted };
}

/**
 * Permanently removes provider-owned call data while Wireline still retains
 * the provider identifiers needed to address it. All destructive requests are
 * retry-idempotent: provider 404/410 responses mean the resource is already
 * gone. Any other provider/configuration failure throws so the delayed account
 * purge retries rather than erasing the only local cleanup pointers.
 */
export async function eraseProviderCallArtifacts(
  pointers: readonly CallArtifactPointer[],
  options: ProviderCallErasureOptions = {},
): Promise<ProviderCallErasureSummary> {
  const fetchFn = options.fetchFn ?? fetch;
  const env = options.env ?? process.env;

  const vapiCallsDeleted = await eraseVapiCalls(pointers, fetchFn, env);
  const twilio = await eraseTwilioVoicemails(pointers, fetchFn, env);

  return {
    vapiCallsDeleted,
    twilioRecordingsDeleted: twilio.recordingsDeleted,
    twilioTranscriptionsDeleted: twilio.transcriptionsDeleted,
    twilioCallsDeleted: twilio.callsDeleted,
  };
}
