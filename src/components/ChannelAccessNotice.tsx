import { Link } from "react-router";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import type { useChannelEntitlements } from "../hooks/useChannelEntitlements";
import { planIncludesChannel, type CommunicationChannel } from "../lib/plan-catalog";

export default function ChannelAccessNotice({
  access,
  channel,
}: {
  access: ReturnType<typeof useChannelEntitlements>;
  channel: CommunicationChannel;
}) {
  if (access.includes(channel)) return null;
  if (access.status === "loading")
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Checking channel access…
      </p>
    );
  if (access.status === "error")
    return (
      <StatusNotice
        tone="warning"
        title="Channel Access Unavailable"
        className="my-3"
        action={
          <Button size="sm" variant="secondary" onClick={access.retry}>
            Retry
          </Button>
        }
      >
        Your saved conversations are unchanged.
      </StatusNotice>
    );
  // A failed renewal suspends every channel. That is a payment to fix, not a
  // plan the owner never bought. Usage plans include all three channels;
  // legacy plans still retain their own channel selection.
  const channelInPlan = planIncludesChannel(access.data?.plan_id, channel);
  if (
    channelInPlan &&
    ["past_due", "unpaid", "incomplete"].includes(access.data?.subscription_status ?? "")
  ) {
    return (
      <StatusNotice
        tone="warning"
        title="Payment Needs Attention"
        className="my-3"
        action={
          <Button asChild size="sm">
            <Link to="/settings/billing">Update Payment</Link>
          </Button>
        }
      >
        {channel === "voice"
          ? "Calls to your BotBound number aren't answered until your payment is updated."
          : channel === "email"
            ? "Your Bot's email is paused until your payment is updated."
            : "Texts are paused until your payment is updated."}{" "}
        Your Bots, numbers, and history are kept.
      </StatusNotice>
    );
  }
  // SMS is included. A payment problem is the only SMS hold shown here.
  if (channel === "sms") return null;
  // Match the tab names owners see: Calls and Email.
  const notIncludedTitle =
    channel === "voice" ? "Calls Aren't in Your Plan" : "Email Isn't in Your Plan";
  const hasPlan = Boolean(access.data?.plan_id);
  return (
    <StatusNotice
      tone="info"
      title={notIncludedTitle}
      className="my-3"
      action={
        <Button asChild size="sm" variant="secondary">
          <Link to="/settings/billing">{hasPlan ? "View Billing" : "Choose Plan"}</Link>
        </Button>
      }
    >
      {hasPlan
        ? "Your plan covers your selected channels. Saved conversations remain available."
        : "Choose a plan to connect this channel. Voice rehearsal stays available."}
    </StatusNotice>
  );
}
