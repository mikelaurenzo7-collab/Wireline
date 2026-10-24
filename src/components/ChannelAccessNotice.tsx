import { Link } from "react-router";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import type { useChannelEntitlements } from "../hooks/useChannelEntitlements";
import {
  channelSoldSelfServe,
  planIncludesChannel,
  type CommunicationChannel,
} from "../lib/plan-catalog";

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
  // Match the tab names owners see: Calls, Email, and Text.
  const notIncludedTitle =
    channel === "voice"
      ? "Calls Aren't in Your Plan"
      : channel === "email"
        ? "Email Isn't in Your Plan"
        : "Texting Isn't in Your Plan";
  // No package sells texting yet, so a package or payment prompt would lead
  // nowhere unless the owner's own plan includes it. Texts sent to a Bot's
  // number are still saved, and this tab shows them.
  if (
    channel === "sms" &&
    !channelSoldSelfServe("sms") &&
    !planIncludesChannel(access.data?.plan_id, "sms")
  ) {
    return (
      <StatusNotice tone="info" title="Texting Isn't Available Yet" className="my-3">
        Texts sent to your Bot&apos;s number appear here. No plan can send texts yet.
      </StatusNotice>
    );
  }
  // A failed renewal suspends every channel. That is a payment to fix, not a
  // package the owner never bought.
  if (
    access.data?.plan_id &&
    ["past_due", "unpaid", "incomplete"].includes(access.data.subscription_status)
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
  const active = access.data?.channels.length !== 0;
  return (
    <StatusNotice
      tone="info"
      title={notIncludedTitle}
      className="my-3"
      action={
        <Button asChild size="sm" variant="secondary">
          <Link to={active ? "/settings/billing" : `/settings/billing?plan=${channel}`}>
            {active ? "View Billing" : "Choose Channels"}
          </Link>
        </Button>
      }
    >
      {active
        ? "Your plan covers your selected channels. Saved conversations remain available."
        : "Choose a package to connect this channel. Trying your Bot privately stays available."}
    </StatusNotice>
  );
}
