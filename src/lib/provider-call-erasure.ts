type CallArtifactPointer = {
  providerCallId: string | null;
  recordingUrl: string | null;
};

type ProviderFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProviderCallErasureOptions {
  fetchFn?: ProviderFetch;
  env?: NodeJS.ProcessEnv;
}

export interface ProviderCallErasureSummary {
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

const TWILIO_API_ORIGIN = "https://api.twilio.com";
const TWILIO_VOICEMAIL_PREFIX = "twilio-voicemail:";
const TWILIO_ACCOUNT_SID_RE = /^AC[0-9a-fA-F]{32}$/;
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

const TWILIO_RECORDING_PATH_RE =
  /^\/2010-04-01\/Accounts\/(AC[0-9a-fA-F]{32})\/Recordings\/(RE[0-9a-fA-F]{32})(?:\.(?:json|mp3|wav))?$/;

/**
 * Non-throwing structural match used to decide which stored pointers are
 * Twilio recordings. Unlike parseTwilioRecordingRef it does not compare the
 * URL's account to configuration, so callers can classify first and validate
 * against the configured account only for pointers they can actually erase.
 */
function twilioRecordingRefFromUrl(recordingUrl: string): TwilioRecordingRef | null {
  let url: URL;
  try {
    url = new URL(recordingUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "api.twilio.com") return null;
  const match = url.pathname.match(TWILIO_RECORDING_PATH_RE);
  if (!match) return null;
  return { accountSid: match[1], recordingSid: match[2] };
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

  const ref = twilioRecordingRefFromUrl(recordingUrl);
  if (!ref) {
    throw new Error("Stored Twilio recording URL cannot be mapped to a Recording resource.");
  }

  if (ref.accountSid !== expectedAccountSid) {
    throw new Error("Stored Twilio recording belongs to a different Twilio account.");
  }

  return ref;
}

async function readJson<T>(response: Response, context: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${context} returned malformed JSON; deferring account purge.`);
  }
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
  const metadata = await readJson<TwilioRecordingMetadata>(
    metadataResponse,
    "Twilio recording lookup",
  );
  const callSid = metadata.call_sid?.trim() || "";
  if (callSid && !TWILIO_CALL_SID_RE.test(callSid)) {
    throw new Error("Twilio recording metadata returned an invalid Call SID.");
  }

  const transcriptionListResponse = await fetchFn(
    twilioResourceUrl(accountSid, `Recordings/${recordingSid}/Transcriptions.json?PageSize=1000`),
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

/**
 * Erases every Twilio recording a tenant's call rows still point at. Failover
 * voicemail pointers are identified by their provider id; live-call recordings
 * (bridged SIP calls) are identified by the stored recording URL itself,
 * because they live on ordinary call rows whose provider id names the AI
 * runtime (`openai:…`), not Twilio. A pointer is included when its URL is a
 * well-formed recording URL for the configured Twilio account; URLs that are
 * not Twilio recordings, or that belong to a different Twilio account, are
 * ignored rather than blocking account erasure forever. Voicemail pointer
 * behavior is unchanged, including deferring the purge when its stored URL is
 * not addressable.
 */
async function eraseTwilioRecordings(
  pointers: readonly CallArtifactPointer[],
  fetchFn: ProviderFetch,
  env: NodeJS.ProcessEnv,
): Promise<{
  recordingsDeleted: number;
  transcriptionsDeleted: number;
  callsDeleted: number;
}> {
  const voicemailRecordingUrls = new Set(
    pointers
      .filter(({ providerCallId }) => providerCallId?.startsWith(TWILIO_VOICEMAIL_PREFIX))
      .map(({ recordingUrl }) => recordingUrl?.trim() || "")
      .filter(Boolean),
  );
  const liveRecordingUrls = [
    ...new Set(
      pointers
        .filter(({ providerCallId }) => !providerCallId?.startsWith(TWILIO_VOICEMAIL_PREFIX))
        .map(({ recordingUrl }) => recordingUrl?.trim() || "")
        .filter(Boolean),
    ),
  ].filter((recordingUrl) => twilioRecordingRefFromUrl(recordingUrl) !== null);

  if (!voicemailRecordingUrls.size && !liveRecordingUrls.length) {
    return { recordingsDeleted: 0, transcriptionsDeleted: 0, callsDeleted: 0 };
  }

  const accountSid = requiredEnv(env, "TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv(env, "TWILIO_AUTH_TOKEN");
  const recordingUrls = new Set([
    ...voicemailRecordingUrls,
    ...liveRecordingUrls.filter(
      (recordingUrl) => twilioRecordingRefFromUrl(recordingUrl)?.accountSid === accountSid,
    ),
  ]);
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

  const twilio = await eraseTwilioRecordings(pointers, fetchFn, env);

  return {
    twilioRecordingsDeleted: twilio.recordingsDeleted,
    twilioTranscriptionsDeleted: twilio.transcriptionsDeleted,
    twilioCallsDeleted: twilio.callsDeleted,
  };
}
