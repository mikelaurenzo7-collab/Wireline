import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { signupHrefForPlan } from "../../lib/signup-intent";
import {
  USAGE_ADDONS,
  USAGE_BASE_USD_MONTHLY,
  USAGE_DEFAULT_MONTHLY_CAP_USD,
  USAGE_INCLUDED_WORK_USD,
  USAGE_METERS,
  USAGE_NEVER_PAY_FOR,
  estimateUsageBill,
  formatUsdCents,
} from "../../lib/usage-billing-catalog";

const CALLS = USAGE_METERS.call_minutes;
const EMAILS = USAGE_METERS.emails_handled;
const COMPUTER = USAGE_METERS.computer_minutes;

function usd(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/** Plain-language rate lines, built from the catalog so copy never drifts. */
export const USAGE_RATE_LINES: ReadonlyArray<readonly [string, string]> = [
  [
    "Call minutes",
    `${usd(CALLS.tiers[0].unitUsd)}/min from your shared work allowance, billed by the second.`,
  ],
  [
    "Emails handled",
    `${usd(EMAILS.tiers[0].unitUsd)} per delivered reply from the same allowance.`,
  ],
  [
    "Computer minutes",
    `${usd(COMPUTER.tiers[0].unitUsd)}/min from the same allowance. Heavy tasks may pause at a processing limit.`,
  ],
  [
    "BotBound number",
    `${usd(USAGE_ADDONS.number.usdMonthly)}/month, only if your Bots take calls.`,
  ],
  [
    "BotBound email address",
    `${usd(USAGE_ADDONS.email_address.usdMonthly)}/month, only if you want one. Gmail and Outlook connect at no extra cost.`,
  ],
];

export interface UsageEstimatorInput {
  callsPerMonth: number;
  avgCallMinutes: number;
  emailsPerMonth: number;
  computerMinutes?: number;
  number: boolean;
  emailAddress: boolean;
}

export function estimateFromSliders(input: UsageEstimatorInput) {
  return estimateUsageBill({
    callMinutes: Math.max(0, input.callsPerMonth) * Math.max(0, input.avgCallMinutes),
    emailsHandled: Math.max(0, input.emailsPerMonth),
    computerMinutes: Math.max(0, input.computerMinutes ?? 0),
    numbers: input.number ? 1 : 0,
    emailAddresses: input.emailAddress ? 1 : 0,
  });
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <output htmlFor={id} className="text-sm tabular-nums text-muted-foreground">
          {value.toLocaleString("en-US")} {suffix}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </div>
  );
}

function Toggle({
  id,
  label,
  detail,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

/** Usage pricing: estimator first, then what is never billed, then the rates. */
export default function UsagePricingPanel() {
  const [callsPerMonth, setCallsPerMonth] = useState(100);
  const [avgCallMinutes, setAvgCallMinutes] = useState(3);
  const [emailsPerMonth, setEmailsPerMonth] = useState(300);
  const [computerMinutes, setComputerMinutes] = useState(15);
  const [number, setNumber] = useState(true);
  const [emailAddress, setEmailAddress] = useState(false);
  const estimate = useMemo(
    () =>
      estimateFromSliders({
        callsPerMonth,
        avgCallMinutes,
        emailsPerMonth,
        computerMinutes,
        number,
        emailAddress,
      }),
    [callsPerMonth, avgCallMinutes, emailsPerMonth, computerMinutes, number, emailAddress],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-center text-sm text-muted-foreground">
        ${USAGE_BASE_USD_MONTHLY}/month includes ${USAGE_INCLUDED_WORK_USD} of work shared across
        calls, email and Computer. Use it in any mix. It resets monthly without rollover.
      </p>
      <article
        aria-label="Monthly estimate"
        className="grid gap-6 rounded-xl border border-border bg-card p-5 md:grid-cols-[1fr_15rem]"
      >
        <div className="space-y-5">
          <Slider
            id="usage-calls"
            label="Calls per month"
            value={callsPerMonth}
            min={0}
            max={2000}
            step={10}
            suffix="calls"
            onChange={setCallsPerMonth}
          />
          <Slider
            id="usage-minutes"
            label="Average call length"
            value={avgCallMinutes}
            min={1}
            max={15}
            step={1}
            suffix="min"
            onChange={setAvgCallMinutes}
          />
          <Slider
            id="usage-emails"
            label="Emails per month"
            value={emailsPerMonth}
            min={0}
            max={5000}
            step={50}
            suffix="emails"
            onChange={setEmailsPerMonth}
          />
          <Slider
            id="usage-computer"
            label="Computer time per month"
            value={computerMinutes}
            min={0}
            max={500}
            step={5}
            suffix="min"
            onChange={setComputerMinutes}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              id="usage-number"
              label={`BotBound number, ${usd(USAGE_ADDONS.number.usdMonthly)}/mo`}
              detail="A local number your Bots answer."
              checked={number}
              onChange={setNumber}
            />
            <Toggle
              id="usage-email-address"
              label={`BotBound email address, ${usd(USAGE_ADDONS.email_address.usdMonthly)}/mo`}
              detail="Or connect the Gmail or Outlook you already use."
              checked={emailAddress}
              onChange={setEmailAddress}
            />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-lg bg-muted/40 p-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              Monthly estimate before tax
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums" aria-live="polite">
              {formatUsdCents(estimate.totalUsd)}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Starts at {usd(USAGE_BASE_USD_MONTHLY)}/month with usage included. You set a monthly
              limit (default {usd(USAGE_DEFAULT_MONTHLY_CAP_USD)}) for BotBound charges before tax.
              Bots pause at your limit. Applicable tax is added separately.
            </p>
          </div>
          <div className="space-y-2">
            <Link
              to={signupHrefForPlan("usage", { usageAddons: { number, emailAddress } })}
              className="marketing-btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
            >
              Get Started <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              to="/contact?topic=demo"
              className="marketing-btn-secondary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >
              Hear a Demo
            </Link>
          </div>
        </div>
      </article>

      <section
        aria-label="Never billed"
        className="rounded-xl border border-border p-4 text-center"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide">You never pay for</h2>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {USAGE_NEVER_PAY_FOR.map((item) => (
            <li
              key={item}
              className="rounded-full border border-border px-3 py-1 text-sm font-semibold"
            >
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          No per-Bot or role charge. Call and email summaries are included.
        </p>
      </section>

      <dl className="grid gap-3 sm:grid-cols-2">
        {USAGE_RATE_LINES.map(([term, detail]) => (
          <div key={term} className="rounded-xl border border-border bg-card px-4 py-3">
            <dt className="text-sm font-semibold">{term}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
      <p className="text-center text-xs text-muted-foreground">
        Billed monthly, by the second. Alerts at 50%, 80%, and 100% of your limit.
      </p>
    </div>
  );
}
