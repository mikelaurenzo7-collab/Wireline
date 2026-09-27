import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { isOwnerEmail } from "./platform-owner-emails";
import { planById, type CommunicationChannel } from "./plan-catalog";
import { drizzle } from "./server-context";

export type TenantChannelEntitlements = {
  planId: string | null;
  subscriptionStatus: string;
  channels: readonly CommunicationChannel[];
  isOwner: boolean;
};

/** Server-read identity and subscription are the only sources of channel authority. */
export async function getTenantChannelEntitlements(
  userId: string,
): Promise<TenantChannelEntitlements> {
  try {
    const [row] = await drizzle
      .select({
        email: schema.users.email,
        plan: schema.subscriptions.plan,
        status: schema.subscriptions.status,
      })
      .from(schema.users)
      .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.users.id))
      .where(eq(schema.users.id, userId))
      .limit(1);
    const isOwner = Boolean(row && isOwnerEmail(row.email));
    const plan = planById(isOwner ? "enterprise" : row?.plan);
    const subscriptionStatus = isOwner ? "active" : (row?.status ?? "pending_activation");
    const active = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    return {
      planId: plan?.id ?? null,
      subscriptionStatus,
      channels: active ? (plan?.channels ?? []) : [],
      isOwner,
    };
  } catch {
    throw AppError.serviceUnavailable(
      "Your communication channels could not be verified. Please retry shortly.",
    );
  }
}

export async function requireTenantChannel(
  userId: string,
  channel: CommunicationChannel,
): Promise<TenantChannelEntitlements> {
  const snapshot = await getTenantChannelEntitlements(userId);
  if (!snapshot.channels.includes(channel)) {
    const label = channel === "voice" ? "Calls" : channel === "sms" ? "SMS" : "Email";
    throw new AppError(
      402,
      "CHANNEL_NOT_INCLUDED",
      `Add ${label} to your plan before using this channel.`,
      {
        channel,
        recovery_path: "/settings/billing",
      },
    );
  }
  return snapshot;
}

/** A shared number serves Calls, SMS, or both; Email alone never allocates one. */
export async function requireTenantPhoneChannel(
  userId: string,
): Promise<TenantChannelEntitlements> {
  const snapshot = await getTenantChannelEntitlements(userId);
  if (!snapshot.channels.some((channel) => channel === "voice" || channel === "sms")) {
    throw new AppError(
      402,
      "CHANNEL_NOT_INCLUDED",
      "Add Calls or SMS to your plan before connecting a line.",
      {
        recovery_path: "/settings/billing",
      },
    );
  }
  return snapshot;
}
