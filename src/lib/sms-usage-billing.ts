import { and, eq, inArray, sql } from "drizzle-orm";
import { usageMeterEvents } from "../db/usage-billing-schema";
import { AppError } from "./api-error";
import { drizzle } from "./server-context";
import { admitAccountUsage } from "./usage-billing-store";
import { usageIdempotencyKey } from "./usage-billing-ledger";

type Reader = Pick<typeof drizzle, "select" | "insert" | "update" | "execute">;
const legacyReceiptKey = (sourceId: string) =>
  usageIdempotencyKey("sms_segments", "sms_send", sourceId);
const receiptKey = (userId: string, sourceId: string) =>
  usageIdempotencyKey("sms_segments", "sms_send", `${userId}:${sourceId.trim()}`);

/** Keep old attempts on their original receipt while scoping every new key to its owner. */
async function findSmsReceipt(reader: Pick<Reader, "select">, userId: string, sourceId: string) {
  const rows = await reader
    .select()
    .from(usageMeterEvents)
    .where(
      and(
        eq(usageMeterEvents.userId, userId),
        inArray(usageMeterEvents.idempotencyKey, [
          receiptKey(userId, sourceId),
          legacyReceiptKey(sourceId),
        ]),
      ),
    )
    .limit(2);
  // Mixed-version attempts must not silently select, release or bill the wrong row.
  if (rows.length > 1) throw new Error("Multiple SMS billing receipts require reconciliation.");
  return rows[0];
}

/** Freeze the period and reserve whole segments before crossing the carrier boundary. */
export async function reserveSmsUsage(
  userId: string,
  sourceId: string,
  segments: number,
  reader?: Reader,
): Promise<{ periodKey: string } | null> {
  if (!Number.isSafeInteger(segments) || segments < 1)
    throw new Error("Invalid SMS segment count.");
  if (!reader) return drizzle.transaction((tx) => reserveSmsUsage(userId, sourceId, segments, tx));
  await reader.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-report:${userId}`}))`);
  const key = receiptKey(userId, sourceId);
  const existing = await findSmsReceipt(reader, userId, sourceId);
  if (existing) {
    if (existing.status !== "admitted" || Number(existing.quantity) !== segments)
      throw new AppError(
        409,
        "SMS_FUNDING_SETTLED",
        "This message attempt has already been settled.",
      );
    return { periodKey: existing.periodKey };
  }
  const admission = await admitAccountUsage(userId, "sms_segments", reader);
  if (!admission) return null;
  if (admission.maxUnits !== null && admission.maxUnits + 1e-9 < segments)
    throw new AppError(
      402,
      "USAGE_SPEND_CAP_REACHED",
      "Your monthly limit cannot fund this message.",
    );
  await reader.insert(usageMeterEvents).values({
    userId,
    periodKey: admission.periodKey,
    meter: "sms_segments",
    sourceType: "sms_send",
    sourceId,
    idempotencyKey: key,
    quantity: String(segments),
    status: "admitted",
    occurredAt: new Date(),
  });
  return { periodKey: admission.periodKey };
}

/** First definitive outcome wins, even after cancellation, renewal or a billing pause. */
export async function settleSmsUsage(
  userId: string,
  sourceId: string,
  segments: number,
  reader?: Reader,
): Promise<boolean> {
  if (!Number.isSafeInteger(segments) || segments < 0)
    throw new Error("Invalid SMS segment count.");
  if (!reader) return drizzle.transaction((tx) => settleSmsUsage(userId, sourceId, segments, tx));
  await reader.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-report:${userId}`}))`);
  const existing = await findSmsReceipt(reader, userId, sourceId);
  if (!existing) return false;
  if (existing.status !== "admitted") {
    if (Number(existing.quantity) !== segments)
      throw new Error(
        "SMS receipt has a different definitive outcome; reconciliation is required.",
      );
    return true;
  }
  await reader
    .update(usageMeterEvents)
    .set({
      quantity: String(segments),
      status: segments === 0 ? "skipped" : "pending",
      ...(segments === 0
        ? { billableQuantity: "0", lastError: "No SMS segments sent; reservation released" }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(usageMeterEvents.id, existing.id), eq(usageMeterEvents.status, "admitted")));
  return true;
}

/** Durable no-send proof permits a fresh attempt; a timeout never creates this proof. */
export async function hasReleasedSmsUsage(userId: string, sourceId: string): Promise<boolean> {
  const receipt = await findSmsReceipt(drizzle, userId, sourceId);
  return receipt?.status === "skipped" && Number(receipt.quantity) === 0;
}
