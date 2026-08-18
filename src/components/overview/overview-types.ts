import type { LucideIcon } from "lucide-react";
import { Mail, MessageSquare, Phone } from "lucide-react";

export type ConversationChannel = "voice" | "email" | "sms";

export type RecentConversation = {
  id: string;
  channel: ConversationChannel;
  contact: string;
  headline?: string | null;
  summary?: string | null;
  occurred_at: string;
  duration_seconds?: number | null;
  agent_name?: string | null;
};

export type OverviewMetrics = {
  conversationsToday: number;
  highIntentToday: number;
  appointmentsBooked: number;
  activeWork: number;
};

export const EMPTY_OVERVIEW_METRICS: OverviewMetrics = {
  conversationsToday: 0,
  highIntentToday: 0,
  appointmentsBooked: 0,
  activeWork: 0,
};

export function conversationChannelLabel(channel: ConversationChannel): string {
  if (channel === "email") return "Email";
  if (channel === "sms") return "Text";
  return "Voice";
}

export function conversationChannelHref(channel: ConversationChannel): string {
  if (channel === "email") return "/inbox?tab=email";
  if (channel === "sms") return "/inbox?tab=sms";
  return "/phone?tab=logs";
}

export function conversationChannelIcon(channel: ConversationChannel): LucideIcon {
  if (channel === "email") return Mail;
  if (channel === "sms") return MessageSquare;
  return Phone;
}

export function formatConversationTime(
  value: string,
  durationSeconds?: number | null,
): string {
  if (!value) return "";
  const date = new Date(value);
  const time = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!durationSeconds) return time;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return [time, duration].filter(Boolean).join(" · ");
}

export function conversationPreview(conversation: RecentConversation): string {
  return (
    conversation.headline?.trim() ||
    conversation.summary?.trim() ||
    "Conversation recorded. Open the thread for the full details."
  );
}
