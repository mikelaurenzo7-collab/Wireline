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
      /** The approved campaign describes texting a caller whose call was missed. */
      coversMissedCalls?: boolean;
      /** The approved campaign describes replies to customer-initiated texts. */
      coversInboundReplies?: boolean;
    }
  | {
      status: "unregistered";
      kind: SmsSenderKind;
      code: "SMS_SENDER_UNREGISTERED" | "SMS_SENDER_REGISTRATION_PENDING";
      reason: string;
    }
  | { status: "unknown"; kind: SmsSenderKind | null; reason: string };

type ListOptions = { limit: number; pageSize?: number };

/** Minimal read surface, so tests can supply a fake without the SDK. */
export interface SmsRegistrationClient {
  incomingPhoneNumbers: {
    list(options: ListOptions): Promise<Array<{ sid: string; phoneNumber: string }>>;
  };
  messaging: {
    v1: {
      services: ((sid: string) => {
        phoneNumbers: {
          list(options: ListOptions): Promise<Array<{ phoneNumber: string }>>;
        };
        usAppToPerson: {
          list(
            options: ListOptions,
          ): Promise<Array<{ campaignStatus: string; description?: string; messageFlow?: string }>>;
        };
      }) & {
        list(options: ListOptions): Promise<Array<{ sid: string }>>;
      };
      tollfreeVerifications: {
        list(
          options: ListOptions,
        ): Promise<Array<{ tollfreePhoneNumberSid: string; status: string }>>;
      };
    };
  };
}

type PooledService = {
  serviceSid: string;
  campaignStatuses: string[];
  /** A VERIFIED campaign in this Service describes missed-call follow-up texts. */
  coversMissedCalls?: boolean;
  coversInboundReplies?: boolean;
};

/** Carriers vetted exactly what the campaign says; missed-call texts need it said. */
export const MISSED_CALL_COVERAGE =
  /missed[- ]call|call (?:is|was) missed|missed (?:their|a|the) call/i;

/** Customer-initiated messaging must appear in the registered consent flow. */
export const INBOUND_REPLY_COVERAGE =
  /(?:inbound|incoming|customer[- ]initiated)\s+(?:sms|text|messag)|(?:customer|recipient|user|caller)s?\s+(?:text|messag)e?s?\s+(?:us|the business|this number)/i;

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
/**
 * The carrier SDK asks for a whole `limit` in one page unless told otherwise,
 * and some of these lists accept at most 50 a page. A page of 1000 was refused
 * ("Page size must be between 1 and 50"), which failed every snapshot read in
 * production and left every line "could not be checked". Fifty is accepted by
 * all of them; the SDK follows the pages up to `limit`.
 */
export const LIST_PAGE_SIZE = 50;
const LIST_PAGE: ListOptions = { limit: LIST_LIMIT, pageSize: LIST_PAGE_SIZE };

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
    client.incomingPhoneNumbers.list(LIST_PAGE),
    client.messaging.v1.services.list(LIST_PAGE),
    client.messaging.v1.tollfreeVerifications.list(LIST_PAGE),
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
        context.phoneNumbers.list(LIST_PAGE),
        context.usAppToPerson.list({ limit: 20, pageSize: 20 }),
      ]);
      const pooled: PooledService = {
        serviceSid: service.sid,
        campaignStatuses: campaigns.map((campaign) =>
          String(campaign?.campaignStatus || "")
            .trim()
            .toUpperCase(),
        ),
        coversMissedCalls: campaigns.some(
          (campaign) =>
            String(campaign?.campaignStatus || "").toUpperCase() === "VERIFIED" &&
            MISSED_CALL_COVERAGE.test(
              `${campaign?.description ?? ""} ${campaign?.messageFlow ?? ""}`,
            ),
        ),
        coversInboundReplies: campaigns.some(
          (campaign) =>
            String(campaign?.campaignStatus || "").toUpperCase() === "VERIFIED" &&
            INBOUND_REPLY_COVERAGE.test(
              `${campaign?.description ?? ""} ${campaign?.messageFlow ?? ""}`,
            ),
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
  "This line isn't approved by US carriers for texting yet, so the text wasn't sent. Add your business details in Lines under Texting Registration; texting turns on once carriers approve it.";
const PENDING_LOCAL =
  "This line's texting approval is still in review, so the text wasn't sent. You can send it again once it's approved.";
const REGISTERING_LOCAL =
  "This line's texting registration has started but isn't approved yet, so the text wasn't sent. Texting turns on once carriers approve it, usually within a few days to two weeks.";
const REJECTED_LOCAL =
  "This line's texting registration wasn't approved, so the text wasn't sent. Contact support to fix and resubmit it.";
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

  // A line the snapshot never saw (bought after the read, or past the list
  // limit) is unknown, not unregistered: an unfamiliar read never blocks.
  if (pooled.length === 0 && !snapshot.numberSids.has(e164)) {
    return { status: "unknown", kind, reason: "The line was not found on the carrier account." };
  }
  const verified = pooled.find((service) => service.campaignStatuses.includes("VERIFIED"));
  if (verified) {
    return {
      status: "registered",
      kind,
      messagingServiceSid: verified.serviceSid,
      coversMissedCalls: verified.coversMissedCalls === true,
      coversInboundReplies: verified.coversInboundReplies === true,
    };
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
  if (pooled.length === 0) {
    // On the account but in no Messaging Service: registration never started.
    return {
      status: "unregistered",
      kind,
      code: "SMS_SENDER_UNREGISTERED",
      reason: UNREGISTERED_LOCAL,
    };
  }
  if (statuses.length === 0) {
    // In a Messaging Service that has no campaign yet. carrier:register
    // attaches the line before the brand is vetted and the campaign exists,
    // so this is registration in progress, not a missing submission.
    return {
      status: "unregistered",
      kind,
      code: "SMS_SENDER_REGISTRATION_PENDING",
      reason: REGISTERING_LOCAL,
    };
  }
  if (statuses.every((status) => FAILED_CAMPAIGN_STATUSES.has(status))) {
    return {
      status: "unregistered",
      kind,
      code: "SMS_SENDER_UNREGISTERED",
      reason: REJECTED_LOCAL,
    };
  }
  return { status: "unknown", kind, reason: "The A2P campaign state is unfamiliar." };
}

/**
 * A refusal from a snapshot at least this old is re-checked against a fresh
 * read, bounding a wrongful block of a newly attached line to one minute
 * without re-reading the account on every send from an unregistered line.
 */
const REFUSAL_RECHECK_MS = 60_000;

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
  const nowMs = options.nowMs ?? Date.now();
  const snapshot = await currentSnapshot(client, nowMs);
  if (!snapshot) {
    return { status: "unknown", kind, reason: "Carrier registration could not be read." };
  }
  const verdict = classifySmsSender(e164, snapshot);
  // Refusing is the only verdict that stops a send, so a refusal from an aging
  // cached read is re-checked: a line attached to a verified service after the
  // snapshot was taken would otherwise be blocked until the cache expires.
  if (verdict.status === "unregistered" && nowMs - snapshot.readAtMs >= REFUSAL_RECHECK_MS) {
    cachedSnapshot = null;
    const fresh = await currentSnapshot(client, nowMs);
    if (fresh) return classifySmsSender(e164, fresh);
  }
  return verdict;
}
