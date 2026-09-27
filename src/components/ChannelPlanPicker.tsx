import type { ReactNode } from "react";
import { Check, Mail, MessageSquare, Phone } from "lucide-react";
import {
  FLAT_OVERAGE_PER_MIN_USD,
  planById,
  type CapacityTier,
  type CommunicationChannel,
} from "../lib/plan-catalog";

export type ChannelPlanOption = {
  id: string;
  name: string;
  channels: readonly CommunicationChannel[];
  price_usd_monthly: number;
  price_usd_annual: number;
  max_agents: number;
  included_phone_numbers: number;
  included_mailboxes: number;
  voice_minutes_monthly: number;
  ai_spend_allowance_usd_monthly?: number;
  runtime_allowance_usd_monthly?: number;
  features: readonly string[];
  capacityTier?: CapacityTier;
  capacity_tier?: CapacityTier | null;
};

export function hasChannelPlanDetails<
  T extends { channels?: readonly CommunicationChannel[]; included_mailboxes?: number },
>(plan: T): plan is T & { channels: readonly CommunicationChannel[]; included_mailboxes: number } {
  return (
    Array.isArray(plan.channels) &&
    plan.channels.length > 0 &&
    plan.channels.every((channel) => ["voice", "email", "sms"].includes(channel)) &&
    typeof plan.included_mailboxes === "number"
  );
}

export const CHANNEL_CHOICES = [
  { id: "voice", label: "Calls", icon: Phone },
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: MessageSquare },
] as const;

export const CAPACITY_CHOICES = [
  { id: "light", label: "Light" },
  { id: "regular", label: "Regular" },
  { id: "high", label: "High" },
] as const;

/** Local catalog compatibility keeps an older cached API projection readable. */
export function channelPlanCapacity(plan: ChannelPlanOption): CapacityTier {
  return plan.capacity_tier ?? plan.capacityTier ?? planById(plan.id)?.capacityTier ?? "light";
}

export function channelSelectionKey(channels: readonly CommunicationChannel[]): string {
  return CHANNEL_CHOICES.filter((item) => channels.includes(item.id))
    .map((item) => item.id)
    .join("+");
}

export function channelPlanHighlights(plan: ChannelPlanOption): string[] {
  const highlights = [`${plan.max_agents} ${plan.max_agents === 1 ? "Bot" : "Bots"}`];
  if (plan.included_phone_numbers > 0)
    highlights.push(
      `${plan.included_phone_numbers} phone number${plan.included_phone_numbers === 1 ? "" : "s"} included`,
    );
  if (plan.channels.includes("voice"))
    highlights.push(`${plan.voice_minutes_monthly} call minutes each month`);
  if (plan.channels.includes("email"))
    highlights.push(
      `${plan.included_mailboxes} Bot mailbox${plan.included_mailboxes === 1 ? "" : "es"} included`,
    );
  if (typeof plan.ai_spend_allowance_usd_monthly === "number")
    highlights.push(
      `$${plan.ai_spend_allowance_usd_monthly.toFixed(2)} managed AI allowance each month`,
    );
  if (
    typeof plan.runtime_allowance_usd_monthly === "number" &&
    plan.runtime_allowance_usd_monthly > 0
  )
    highlights.push(
      `$${plan.runtime_allowance_usd_monthly.toFixed(2)} Runtime Allowance each month`,
    );
  return highlights;
}

/** One channel choice maps to a server-owned package; the browser never sets prices. */
export default function ChannelPlanPicker({
  id = "channel-plan",
  plans,
  selectedPlanId,
  onSelectPlan,
  interval,
  renderAction,
  disabled = false,
  lockChannels = false,
}: {
  id?: string;
  plans: readonly ChannelPlanOption[];
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  interval: "month" | "year";
  renderAction: (plan: ChannelPlanOption) => ReactNode;
  disabled?: boolean;
  /** Paid capacity changes keep the current channel package intact. */
  lockChannels?: boolean;
}) {
  const plan =
    plans.find((item) => item.id === selectedPlanId) ??
    plans.find((item) => item.id === "voice-regular");
  if (!plan)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Plan options are unavailable. Please try again.
      </p>
    );
  const choose = (channel: CommunicationChannel) => {
    const next = plan.channels.includes(channel)
      ? plan.channels.filter((item) => item !== channel)
      : [...plan.channels, channel];
    const matching = plans.find(
      (item) =>
        channelSelectionKey(item.channels) === channelSelectionKey(next) &&
        channelPlanCapacity(item) === channelPlanCapacity(plan),
    );
    if (matching) onSelectPlan(matching.id);
  };
  const price = interval === "year" ? plan.price_usd_annual : plan.price_usd_monthly;
  const annualSavings = Math.max(0, plan.price_usd_monthly * 12 - plan.price_usd_annual);
  return (
    <div className="min-w-0 space-y-4">
      <fieldset disabled={disabled || lockChannels} className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-foreground">Choose your channels</legend>
        <div className="grid min-w-0 grid-cols-3 gap-2">
          {CHANNEL_CHOICES.map(({ id, label, icon: Icon }) => {
            const checked = plan.channels.includes(id);
            return (
              <label
                key={id}
                className={`flex min-h-14 min-w-0 cursor-pointer flex-wrap items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-semibold ${checked ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => choose(id)}
                  disabled={disabled || lockChannels || (checked && plan.channels.length === 1)}
                  className="size-4 accent-[var(--wireline-color-action-primary-default)]"
                />
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-foreground">Monthly capacity</legend>
        <div className="grid min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-2 max-[359px]:grid-cols-1">
          {CAPACITY_CHOICES.map(({ id: capacity, label }) => {
            const option = plans.find(
              (item) =>
                channelSelectionKey(item.channels) === channelSelectionKey(plan.channels) &&
                channelPlanCapacity(item) === capacity,
            );
            const checked = channelPlanCapacity(plan) === capacity;
            return (
              <label
                key={capacity}
                className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center text-sm ${checked ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground"}`}
              >
                <span className="flex min-w-0 flex-wrap items-center justify-center gap-1.5 break-words font-semibold">
                  <input
                    type="radio"
                    name={`${id}-capacity`}
                    value={capacity}
                    checked={checked}
                    onChange={() => option && onSelectPlan(option.id)}
                    disabled={disabled || !option}
                    className="size-4 accent-[var(--wireline-color-action-primary-default)]"
                  />
                  {label}
                </span>
                {option ? (
                  <span className="text-xs tabular-nums">
                    {option.channels.includes("voice")
                      ? `${option.voice_minutes_monthly.toLocaleString()} min`
                      : `$${option.ai_spend_allowance_usd_monthly ?? 0} allowance`}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      <article
        className="wl-billing-plan min-w-0 rounded-xl border border-border bg-card p-4 text-left sm:p-5"
        aria-label="Selected package"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            {plan.name.replace(/^BotBound\s+/, "")}
          </h2>
          <p className="text-sm text-muted-foreground">
            <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              ${price.toLocaleString()}
            </span>
            /{interval === "year" ? "year" : "month"}
          </p>
        </div>
        {interval === "year" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Billed annually.
            {annualSavings > 0
              ? ` Save $${annualSavings.toLocaleString(undefined, { maximumFractionDigits: 2 })} vs monthly.`
              : ""}
          </p>
        ) : null}
        <ul className="my-4 space-y-2 text-sm">
          {channelPlanHighlights(plan).map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {plan.channels.includes("voice") ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Calls include up to 10 minutes of paid completion credit at $
            {FLAT_OVERAGE_PER_MIN_USD.toFixed(2)}/min.
          </p>
        ) : null}
        {renderAction(plan)}
        {plan.features.length ? (
          <details className="mt-3 border-t border-border pt-2">
            <summary className="wl-focus-ring-halo min-h-11 cursor-pointer py-3 text-sm font-medium text-muted-foreground">
              Plan details
            </summary>
            <ul className="space-y-2 pb-2 text-sm text-muted-foreground">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </article>
    </div>
  );
}
