import { Link } from "react-router";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import type { useChannelEntitlements } from "../hooks/useChannelEntitlements";
import type { CommunicationChannel } from "../lib/plan-catalog";

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
        title="Channel access unavailable"
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
  const label = channel === "voice" ? "Calls" : channel === "email" ? "Email" : "SMS";
  // A failed renewal suspends every channel. That is a payment to fix, not a
  // package the owner never bought.
  if (
    access.data?.plan_id &&
    ["past_due", "unpaid", "incomplete"].includes(access.data.subscription_status)
  ) {
    return (
      <StatusNotice
        tone="warning"
        title="Payment needs attention"
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
      title={`${label} isn't included`}
      className="my-3"
      action={
        <Button asChild size="sm" variant="secondary">
          <Link to={active ? "/settings/billing" : `/settings/billing?plan=${channel}`}>
            {active ? "View billing" : "Choose channels"}
          </Link>
        </Button>
      }
    >
      {active
        ? "Your plan covers your selected channels. Saved conversations remain available."
        : "Choose a package to connect this channel. Private testing remains available."}
    </StatusNotice>
  );
}
