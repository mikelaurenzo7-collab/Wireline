import { createHash } from "node:crypto";

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import { resolveCanonicalAppUrl } from "./app-url";
import { enqueue } from "./job-queue";
import { ACTIVE_OPERATOR_TASK_STATUSES } from "./operator-work-status";
import { formatPhone } from "./safe-number";
import { drizzle, log, tenantStore } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * Tells the owner when their Bot hands them something.
 *
 * A Bot that acts on its own leaves the owner very little, and each thing it
 * does leave is a person waiting: a caller who asked for someone, an email
 * whose address needs checking, a text the law would not let the Bot send.
 * Until now such an item only changed a badge inside the app, so it waited
 * until the owner happened to open the app. Half of what was waiting when
 * this was written had waited more than thirty days.
 *
 * One short email, a couple of minutes after the item appears so that one
 * call's items arrive together, naming what is waiting and linking to it.
 * Nothing here can stop or slow the Bot: queueing never throws.
 */

export const NEEDS_YOU_NOTICE_JOB = "needs_you_notice";

/** One call's follow-ups land within seconds of each other; wait for them. */
const NOTICE_DELAY_MS = 90_000;
/** A first notice never reaches further back than this. */
const NOTICE_LOOKBACK_MS = 24 * 60 * 60_000;
/** A busy hour produces a few notices, not one per item. */
const NOTICES_PER_HOUR = 6;
const NOTICE_RETRY_AFTER_CAP_MS = 15 * 60_000;
const ITEMS_LISTED = 6;

/**
 * What a Bot hands to its owner. An item the owner created themselves (a
 * conversation they marked for follow-up) and a finished call note are not
 * news to the owner and are left out.
 */
export const NEEDS_YOU_TASK_TYPES = [
  "send_email",
  "send_text_message",
  "schedule_calendar",
  "send_contract",
  "internal_task",
  "follow_up",
  "ticket",
  "callback",
  "human_escalation",
  "messenger_inbound",
  "review_escalation",
] as const;

export type NeedsYouItem = {
  id: string;
  taskType: string | null;
  description: string | null;
  payload: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 240): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appUrl(pathname: string): string {
  const canonical = resolveCanonicalAppUrl();
  const base = "error" in canonical ? "https://botbound.app" : canonical.url;
  return new URL(pathname, `${base.replace(/\/+$/, "")}/`).toString();
}

/** One item in the owner's words: what is waiting, and why if the Bot said. */
export function needsYouLine(item: NeedsYouItem): { what: string; detail: string } {
  const payload = record(item.payload);
  const reason = text(payload.reasoning);
  const description = text(item.description);
  switch (item.taskType) {
    case "send_email": {
      const to = text(payload.to, 120) || "a customer";
      const subject = text(payload.subject, 120);
      return {
        what: `An email to ${to} is written and waiting for you to send`,
        detail: [subject ? `Subject: ${subject}` : "", reason].filter(Boolean).join(". "),
      };
    }
    case "send_text_message": {
      const to = formatPhone(payload.to, "") || "a customer";
      return {
        what: `A text to ${to} is written and waiting for you to send`,
        detail: [text(payload.body), reason].filter(Boolean).join(" "),
      };
    }
    case "schedule_calendar":
      return {
        what: "A booking is waiting for you to confirm",
        detail: text(payload.event_name) || description,
      };
    case "human_escalation":
      return { what: "A caller asked for a person", detail: text(payload.reason) || description };
    case "send_contract":
      return { what: "A contract is waiting for you to send", detail: description };
    default:
      return {
        what: description || "Your Bot left you a follow-up",
        detail: description ? "" : reason,
      };
  }
}

/** The owner's email: what is waiting, most recent first, and one link. */
export function buildNeedsYouEmail(items: readonly NeedsYouItem[]): {
  subject: string;
  text: string;
  html: string;
} {
  const lines = items.slice(0, ITEMS_LISTED).map(needsYouLine);
  const more = items.length - lines.length;
  const url = appUrl("/inbox?tab=approvals");
  const first = lines[0]?.what ?? "Your Bot left you a follow-up";
  const subject =
    items.length === 1
      ? `Needs you: ${first.charAt(0).toLowerCase()}${first.slice(1)}`
      : `${items.length} things need you`;
  const intro =
    items.length === 1
      ? "Your Bot handled the rest. This one needs you:"
      : "Your Bot handled the rest. These need you:";
  return {
    subject: subject.length > 140 ? `${subject.slice(0, 139).trimEnd()}…` : subject,
    text: [
      intro,
      "",
      ...lines.map((line) => `- ${line.what}.${line.detail ? ` ${line.detail}` : ""}`),
      more > 0 ? `- and ${more} more.` : null,
      "",
      `Open Needs You: ${url}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      "<ul>",
      ...lines.map(
        (line) =>
          `<li><strong>${escapeHtml(line.what)}.</strong>${line.detail ? ` ${escapeHtml(line.detail)}` : ""}</li>`,
      ),
      more > 0 ? `<li>and ${more} more.</li>` : "",
      "</ul>",
      `<p><a href="${escapeHtml(url)}">Open Needs You</a></p>`,
    ].join(""),
  };
}

/**
 * Ask for a notice. Safe to call from anywhere a Bot hands the owner
 * something: it never throws, and a notice already on its way covers the new
 * item, because the notice reads what is waiting when it runs.
 */
export async function queueNeedsYouNotice(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const [waiting] = await drizzle
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, NEEDS_YOU_NOTICE_JOB),
          // A running notice has already read the list, so it does not count.
          inArray(schema.jobs.status, ["pending", "failed"]),
        ),
      )
      .limit(1);
    if (waiting) return;
    const queued = await enqueue(drizzle, {
      userId,
      type: NEEDS_YOU_NOTICE_JOB,
      payload: { userId },
      runAt: new Date(Date.now() + NOTICE_DELAY_MS),
    });
    if (!queued.ok) log.warn("Needs You notice was not queued", { error: queued.error });
  } catch (error) {
    log.warn("Needs You notice was not queued", { error: getErrorMessage(error) });
  }
}

/** Item ids earlier notices already told the owner about. */
function notifiedIds(results: readonly unknown[]): Set<string> {
  const seen = new Set<string>();
  for (const result of results) {
    const ids = record(result).notifiedTaskIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) if (typeof id === "string") seen.add(id);
  }
  return seen;
}

/**
 * The queued notice for one owner. It reads what is waiting now, leaves out
 * what an earlier notice already named, and sends one email. A thrown error
 * is retried by the queue; the idempotency key is the list of items, so a
 * retry, or a second notice that read the same list, cannot email twice.
 */
export async function handleNeedsYouNoticeJob(job: {
  id: string;
  payload: unknown;
  userId?: string | null;
  user_id?: string | null;
}): Promise<void> {
  const owner = job.userId ?? job.user_id;
  const userId = record(job.payload).userId;
  if (typeof userId !== "string" || !userId || userId !== owner) {
    throw new Error("Needs You notice job has an invalid payload.");
  }
  await tenantStore.run(userId, async () => {
    const now = Date.now();
    const since = new Date(now - NOTICE_LOOKBACK_MS);
    const earlier = await drizzle
      .select({ result: schema.jobs.result, finishedAt: schema.jobs.finishedAt })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, NEEDS_YOU_NOTICE_JOB),
          eq(schema.jobs.status, "done"),
          gte(schema.jobs.finishedAt, since),
        ),
      )
      .orderBy(desc(schema.jobs.finishedAt))
      .limit(200);
    const told = notifiedIds(earlier.map((row) => row.result));

    const waiting = await drizzle
      .select({
        id: schema.followUpTasks.id,
        taskType: schema.followUpTasks.taskType,
        description: schema.followUpTasks.description,
        payload: schema.followUpTasks.payload,
      })
      .from(schema.followUpTasks)
      .where(
        and(
          eq(schema.followUpTasks.userId, userId),
          inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES]),
          inArray(schema.followUpTasks.taskType, [...NEEDS_YOU_TASK_TYPES]),
          gte(schema.followUpTasks.createdAt, since),
        ),
      )
      .orderBy(desc(schema.followUpTasks.createdAt))
      .limit(50);
    const items = waiting.filter((item) => !told.has(item.id));
    if (items.length === 0) return;

    const sentThisHour = earlier.filter(
      (row) =>
        row.finishedAt instanceof Date &&
        row.finishedAt.getTime() >= now - 60 * 60_000 &&
        notifiedIds([row.result]).size > 0,
    ).length;
    if (sentThisHour >= NOTICES_PER_HOUR) {
      // The items are not lost: a later notice reads them again.
      const later = await enqueue(drizzle, {
        userId,
        type: NEEDS_YOU_NOTICE_JOB,
        payload: { userId },
        runAt: new Date(now + NOTICE_RETRY_AFTER_CAP_MS),
      });
      if (!later.ok) throw new Error(`Needs You notice could not be deferred: ${later.error}`);
      return;
    }

    const { pickAccountHolderEmail } = await import("./post-call-digest");
    const to = await pickAccountHolderEmail(userId);
    if (!to) return;
    const ids = items.map((item) => item.id).sort();
    const { sendTenantEmail } = await import("./email-service");
    const sent = await sendTenantEmail({
      userId,
      action: "needs_you_owner_notification",
      to,
      ...buildNeedsYouEmail(items),
      idempotencyKey: `needs-you/${createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 40)}`,
    });
    if (!sent.ok && sent.disposition !== "suppressed") {
      throw new Error(sent.error || "Needs You notice was not accepted");
    }
    // A test workspace's notice is suppressed, not sent. It is recorded the
    // same way so the same items are not read again every time one is added.
    await drizzle
      .update(schema.jobs)
      .set({ result: { notifiedTaskIds: ids, delivered: sent.ok } })
      .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.userId, userId)));
  });
}
