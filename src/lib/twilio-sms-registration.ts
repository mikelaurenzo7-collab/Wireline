/**
 * US carrier registration of a tenant SMS sender, read from Twilio itself.
 *
 * A2P 10DLC: Twilio selects the campaign from the sending number's Messaging
 * Service sender pool. A local number is registered only while it sits in a
 * Service whose US A2P campaign is VERIFIED. Unregistered local traffic fails
 * with 30034. Toll-free: only a TWILIO_APPROVED verification may send; pending
 * and restricted numbers are blocked with 30032. Both blocked cases are still
 * billed by the carrier path, so a known-unregistered sender is refused before
 * any reservation or provider request.
 *
 * The snapshot is read-only and account-wide. A failed or unfamiliar read
 * returns `unknown` so the carrier stays the final judge. It never
 * manufactures `registered`.
 */
import { getTwilioClient } from "./twilio-service-base";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type SmsSenderKind = "local_10dlc" | "toll_free";

export type SmsSenderRegistration =
  | {
      status: "registered";
      kind: SmsSenderKind;
      /** Service that carries the approved registration, when the sender is pooled. */
      messagingServiceSid: string | null;
    }
  | {
      status: "unregistered";
      kind: SmsSenderKind;
      code: "SMS_SENDER_UNREGISTERED" | "SMS_SENDER_REGISTRATION_PENDING";
      reason: string;
    }
  | { status: "unknown"; kind: SmsSenderKind | null; reason: string };

/** Minimal read surface, so tests can supply a fake without the SDK. */
export interface SmsRegistrationClient {
  incomingPhoneNumbers: {
    list(options: { limit: number }): Promise<Array<{ sid: string; phoneNumber: string }>>;
  };
  messaging: {
    v1: {
      services: ((sid: string) => {
        phoneNumbers: {
          list(options: { limit: number }): Promise<Array<{ phoneNumber: string }>>;
        };
        usAppToPerson: {
          list(options: { limit: number }): Promise<Array<{ campaignStatus: string }>>;
        };
      }) & {
        list(options: { limit: number }): Promise<Array<{ sid: string }>>;
      };
      tollfreeVerifications: {
        list(options: {
          limit: number;
        }): Promise<Array<{ tollfreePhoneNumberSid: string; status: string }>>;
      };
    };
  };
}

type PooledService = { serviceSid: string; campaignStatuses: string[] };

export type SmsRegistrationSnapshot = {
  readAtMs: number;
  /** E.164 -> IncomingPhoneNumber SID for numbers on this account. */
  numberSids: Map<string, string>;
  /** E.164 -> Messaging Services whose sender pool holds the number. */
  pools: Map<string, PooledService[]>;
  /** IncomingPhoneNumber SID -> toll-free verification statuses. */
  tollFree: Map<string, string[]>;
};

const TOLL_FREE_E164 = /^\+18(?:00|33|44|55|66|77|88)\d{7}$/;
const NANP_E164 = /^\+1\d{10}$/;
const SNAPSHOT_TTL_MS = 10 * 60_000;
/** A recent good snapshot outlives a transient read failure. */
const STALE_SNAPSHOT_MAX_MS = 60 * 60_000;
const LIST_LIMIT = 1000;

const PENDING_CAMPAIGN_STATUSES = new Set(["IN_PROGRESS", "PENDING"]);
const FAILED_CAMPAIGN_STATUSES = new Set(["FAILED", "SUSPENDED", "EXPIRED"]);
const PENDING_TOLL_FREE_STATUSES = new Set(["PENDING_REVIEW", "IN_REVIEW"]);

export function smsSenderKind(e164: string): SmsSenderKind | null {
  if (!NANP_E164.test(e164)) return null;
  return TOLL_FREE_E164.test(e164) ? "toll_free" : "local_10dlc";
}

export async function readSmsRegistrationSnapshot(
  client: SmsRegistrationClient,
  nowMs: number = Date.now(),
): Promise<SmsRegistrationSnapshot> {
  const [numbers, services, verifications] = await Promise.all([
    client.incomingPhoneNumbers.list({ limit: LIST_LIMIT }),
    client.messaging.v1.services.list({ limit: LIST_LIMIT }),
    client.messaging.v1.tollfreeVerifications.list({ limit: LIST_LIMIT }),
  ]);

  const numberSids = new Map<string, string>();
  for (const number of numbers) {
    if (number?.phoneNumber && number?.sid) numberSids.set(number.phoneNumber, number.sid);
  }

  const pools = new Map<string, PooledService[]>();
  await Promise.all(
    services.map(async (service) => {
      if (!service?.sid) return;
      const context = client.messaging.v1.services(service.sid);
      const [senders, campaigns] = await Promise.all([
        context.phoneNumbers.list({ limit: LIST_LIMIT }),
        context.usAppToPerson.list({ limit: 20 }),
      ]);
      const pooled: PooledService = {
        serviceSid: service.sid,
        campaignStatuses: campaigns.map((campaign) =>
          String(campaign?.campaignStatus || "")
            .trim()
            .toUpperCase(),
        ),
      };
      for (const sender of senders) {
        if (!sender?.phoneNumber) continue;
        const existing = pools.get(sender.phoneNumber) ?? [];
        existing.push(pooled);
        pools.set(sender.phoneNumber, existing);
      }
    }),
  );

  const tollFree = new Map<string, string[]>();
  for (const verification of verifications) {
    const sid = verification?.tollfreePhoneNumberSid;
    if (!sid) continue;
    const existing = tollFree.get(sid) ?? [];
    existing.push(
      String(verification.status || "")
        .trim()
        .toUpperCase(),
    );
    tollFree.set(sid, existing);
  }

  return { readAtMs: nowMs, numberSids, pools, tollFree };
}

// Owner-facing: these reach Inbox and Approvals as written. Keep carrier
// program names out; operators read the code and the readiness report.
const UNREGISTERED_LOCAL =
  "This line isn't approved by US carriers for texting yet, so the text wasn't sent. Texting turns on when your business registration is approved.";
const PENDING_LOCAL =
  "This line's texting approval is still in review, so the text wasn't sent. You can send it again once it's approved.";
const UNVERIFIED_TOLL_FREE =
  "This toll-free line isn't approved for texting yet, so the text wasn't sent. Texting turns on when its verification is approved.";
const PENDING_TOLL_FREE =
  "This toll-free line's texting approval is still in review, so the text wasn't sent. You can send it again once it's approved.";
const REJECTED_TOLL_FREE =
  "This toll-free line wasn't approved for texting, so the text wasn't sent. Contact support to fix and resubmit its registration.";

/** Pure classification of one sender against a snapshot. */
export function classifySmsSender(
  e164: string,
  snapshot: SmsRegistrationSnapshot,
): SmsSenderRegistration {
  const kind = smsSenderKind(e164);
  if (!kind) {
    return { status: "unknown", kind: null, reason: "US carrier registration does not apply." };
  }
  const pooled = snapshot.pools.get(e164) ?? [];

  if (kind === "toll_free") {
    const numberSid = snapshot.numberSids.get(e164);
    if (!numberSid) {
      return { status: "unknown", kind, reason: "The line was not found on the carrier account." };
    }
    const statuses = snapshot.tollFree.get(numberSid) ?? [];
    if (statuses.includes("TWILIO_APPROVED")) {
      return { status: "registered", kind, messagingServiceSid: pooled[0]?.serviceSid ?? null };
    }
    if (statuses.some((status) => PENDING_TOLL_FREE_STATUSES.has(status))) {
      return {
        status: "unregistered",
        kind,
        code: "SMS_SENDER_REGISTRATION_PENDING",
        reason: PENDING_TOLL_FREE,
      };
    }
    if (statuses.includes("TWILIO_REJECTED")) {
      return {
        status: "unregistered",
        kind,
        code: "SMS_SENDER_UNREGISTERED",
        reason: REJECTED_TOLL_FREE,
      };
    }
    if (statuses.length === 0) {
      return {
        status: "unregistered",
        kind,
        code: "SMS_SENDER_UNREGISTERED",
        reason: UNVERIFIED_TOLL_FREE,
      };
    }
    return { status: "unknown", kind, reason: "The toll-free verification state is unfamiliar." };
  }

  const verified = pooled.find((service) => service.campaignStatuses.includes("VERIFIED"));
  if (verified) {
    return { status: "registered", kind, messagingServiceSid: verified.serviceSid };
  }
  const statuses = pooled.flatMap((service) => service.campaignStatuses);
  if (statuses.some((status) => PENDING_CAMPAIGN_STATUSES.has(status))) {
    return {
      status: "unregistered",
      kind,
      code: "SMS_SENDER_REGISTRATION_PENDING",
      reason: PENDING_LOCAL,
    };
  }
  if (statuses.every((status) => FAILED_CAMPAIGN_STATUSES.has(status))) {
    // No pool, campaign-less pools, or only failed campaigns.
    return {
      status: "unregistered",
      kind,
      code: "SMS_SENDER_UNREGISTERED",
      reason: UNREGISTERED_LOCAL,
    };
  }
  return { status: "unknown", kind, reason: "The A2P campaign state is unfamiliar." };
}

let cachedSnapshot: SmsRegistrationSnapshot | null = null;
let inflight: Promise<SmsRegistrationSnapshot> | null = null;

/** Test and operator hook. Production reads expire on their own. */
export function resetSmsRegistrationCache(): void {
  cachedSnapshot = null;
  inflight = null;
}

async function currentSnapshot(
  client: SmsRegistrationClient,
  nowMs: number,
): Promise<SmsRegistrationSnapshot | null> {
  if (cachedSnapshot && nowMs - cachedSnapshot.readAtMs < SNAPSHOT_TTL_MS) return cachedSnapshot;
  if (!inflight) {
    inflight = readSmsRegistrationSnapshot(client, nowMs).finally(() => {
      inflight = null;
    });
  }
  try {
    cachedSnapshot = await inflight;
    return cachedSnapshot;
  } catch (error) {
    log.warn("Twilio SMS registration snapshot unavailable", { error: getErrorMessage(error) });
    if (cachedSnapshot && nowMs - cachedSnapshot.readAtMs < STALE_SNAPSHOT_MAX_MS) {
      return cachedSnapshot;
    }
    return null;
  }
}

function isRegistrationClient(client: unknown): client is SmsRegistrationClient {
  const candidate = client as Partial<SmsRegistrationClient> | null | undefined;
  return (
    typeof candidate?.incomingPhoneNumbers?.list === "function" &&
    typeof candidate?.messaging?.v1?.services === "function" &&
    typeof candidate?.messaging?.v1?.services?.list === "function" &&
    typeof candidate?.messaging?.v1?.tollfreeVerifications?.list === "function"
  );
}

/**
 * Registration of one E.164 sender on the platform Twilio account. Callers
 * refuse only `unregistered`; `unknown` proceeds to the carrier unchanged.
 */
export async function resolveSmsSenderRegistration(
  e164: string,
  options: { client?: unknown; nowMs?: number } = {},
): Promise<SmsSenderRegistration> {
  const kind = smsSenderKind(e164);
  if (!kind) {
    return { status: "unknown", kind: null, reason: "US carrier registration does not apply." };
  }
  const client = options.client ?? getTwilioClient();
  if (!isRegistrationClient(client)) {
    return { status: "unknown", kind, reason: "Carrier registration could not be read." };
  }
  const snapshot = await currentSnapshot(client, options.nowMs ?? Date.now());
  if (!snapshot) {
    return { status: "unknown", kind, reason: "Carrier registration could not be read." };
  }
  return classifySmsSender(e164, snapshot);
}
