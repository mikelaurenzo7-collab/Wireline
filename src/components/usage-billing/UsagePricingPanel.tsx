import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { signupHrefForPlan } from "../../lib/signup-intent";
import {
  USAGE_ADDONS,
  USAGE_DEFAULT_MONTHLY_CAP_USD,
  USAGE_TIERS,
  PUBLIC_USAGE_TIERS,
  DEFAULT_PUBLIC_USAGE_TIER,
  usageTier,
  type UsageTierId,
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
    "Call Minutes",
    `${usd(CALLS.tiers[0].unitUsd)}/min from your shared work allowance, billed by the second.`,
  ],
  ["Emails Handled", `${usd(EMAILS.tiers[0].unitUsd)} per sent reply from the same allowance.`],
  [
    "Computer Minutes",
    `${usd(COMPUTER.tiers[0].unitUsd)}/min from the same allowance. Heavy tasks may pause at a processing limit.`,
  ],
  [
    "Extra Number",
    `${usd(USAGE_ADDONS.number.usdMonthly)}/month beyond your plan's included local numbers.`,
  ],
  [
    "Extra Email Address",
    `${usd(USAGE_ADDONS.email_address.usdMonthly)}/month beyond your included addresses. Gmail and Outlook connect at no extra cost.`,
  ],
];

export interface UsageEstimatorInput {
  tier?: UsageTierId;
  callsPerMonth: number;
  avgCallMinutes: number;
  emailsPerMonth: number;
  computerMinutes?: number;
  number: boolean;
  emailAddress: boolean;
  extraNumbers?: number;
  extraEmailAddresses?: number;
}

export function estimateFromSliders(input: UsageEstimatorInput) {
  const plan = usageTier(input.tier);
  return estimateUsageBill(
    {
      callMinutes: Math.max(0, input.callsPerMonth) * Math.max(0, input.avgCallMinutes),
      emailsHandled: Math.max(0, input.emailsPerMonth),
      computerMinutes: Math.max(0, input.computerMinutes ?? 0),
      numbers: input.extraNumbers ?? Math.max(0, Number(input.number) - plan.includedNumbers),
      emailAddresses:
        input.extraEmailAddresses ??
        Math.max(0, Number(input.emailAddress) - plan.includedEmailAddresses),
    },
    input.tier,
  );
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
export default function UsagePricingPanel({
  availableTiers = PUBLIC_USAGE_TIERS,
}: {
  availableTiers?: readonly UsageTierId[];
}) {
  const [selectedTier, setTier] = useState<UsageTierId>(DEFAULT_PUBLIC_USAGE_TIER);
  const tier = availableTiers.includes(selectedTier)
    ? selectedTier
    : (availableTiers[0] ?? DEFAULT_PUBLIC_USAGE_TIER);
  const plan = usageTier(tier);
  const [callsPerMonth, setCallsPerMonth] = useState(0);
  const [avgCallMinutes, setAvgCallMinutes] = useState(3);
  const [emailsPerMonth, setEmailsPerMonth] = useState(0);
  const [computerMinutes, setComputerMinutes] = useState(0);
  const [number, setNumber] = useState(false);
  const [emailAddress, setEmailAddress] = useState(false);
  const estimate = useMemo(
    () =>
      estimateFromSliders({
        tier,
        callsPerMonth,
        avgCallMinutes,
        emailsPerMonth,
        computerMinutes,
        number: false,
        emailAddress: false,
        extraNumbers: Number(number),
        extraEmailAddresses: Number(emailAddress),
      }),
    [tier, callsPerMonth, avgCallMinutes, emailsPerMonth, computerMinutes, number, emailAddress],
  );

  if (availableTiers.length === 0) return null;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="grid gap-4 sm:grid-cols-3" aria-label="Choose a Plan">
        {availableTiers.map((id) => {
          const option = USAGE_TIERS[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={tier === id}
              onClick={() => setTier(id)}
              className={`rounded-2xl border p-6 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${tier === id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <span className="block text-lg font-semibold">{option.name}</span>
              <span className="mt-3 block">
                <strong className="text-4xl font-semibold">${option.monthlyUsd}</strong>
                <span className="text-sm text-muted-foreground"> / Month</span>
              </span>
              <span className="mt-4 block text-sm font-semibold">
                ${option.includedWorkUsd} Shared Work
              </span>
              <span className="mt-2 block text-sm text-muted-foreground">
                {option.includedNumbers} {option.includedNumbers === 1 ? "Number" : "Numbers"}
                {" + "}
                {option.includedEmailAddresses}{" "}
                {option.includedEmailAddresses === 1 ? "Email Address" : "Email Addresses"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Calls, email and Computer share one allowance. Use any mix. Resets monthly; no rollover.
      </p>
      <article
        aria-label="Monthly estimate"
        className="grid gap-8 rounded-2xl border border-border bg-card p-5 sm:p-8 md:grid-cols-[1fr_17rem]"
      >
        <div className="space-y-5">
          <Slider
            id="usage-calls"
            label="Calls per Month"
            value={callsPerMonth}
            min={0}
            max={2000}
            step={10}
            suffix="calls"
            onChange={setCallsPerMonth}
          />
          <Slider
            id="usage-minutes"
            label="Average Call Length"
            value={avgCallMinutes}
            min={1}
            max={15}
            step={1}
            suffix="min"
            onChange={setAvgCallMinutes}
          />
          <Slider
            id="usage-emails"
            label="Emails per Month"
            value={emailsPerMonth}
            min={0}
            max={5000}
            step={50}
            suffix="emails"
            onChange={setEmailsPerMonth}
          />
          <Slider
            id="usage-computer"
            label="Computer Time per Month"
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
              label={`Extra Number, ${usd(USAGE_ADDONS.number.usdMonthly)}/mo`}
              detail={`${plan.includedNumbers} included with ${plan.name}.`}
              checked={number}
              onChange={setNumber}
            />
            <Toggle
              id="usage-email-address"
              label={`Extra Email Address, ${usd(USAGE_ADDONS.email_address.usdMonthly)}/mo`}
              detail={`${plan.includedEmailAddresses} included with ${plan.name}.`}
              checked={emailAddress}
              onChange={setEmailAddress}
            />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-lg bg-muted/40 p-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              Monthly Estimate Before Tax
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums" aria-live="polite">
              {formatUsdCents(estimate.totalUsd)}
            </p>
            <dl className="my-5 space-y-2 border-y border-border py-4 text-sm">
              {(
                [
                  [plan.name, plan.monthlyUsd],
                  ["Work", estimate.workUsd],
                  ["Included Work Used", -estimate.includedUsedUsd],
                  ["Optional Add-Ons", estimate.fixedUsd - plan.monthlyUsd],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">
                    {value < 0 ? "-" : ""}
                    {usd(Math.abs(value))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Set your monthly limit (default {usd(USAGE_DEFAULT_MONTHLY_CAP_USD)} before tax). Bots
              pause at your limit. Tax is added separately.
            </p>
          </div>
          <div className="space-y-2">
            <Link
              to={signupHrefForPlan("usage", {
                usageTier: tier,
                usageAddons: {
                  number,
                  emailAddress,
                },
              })}
              className="marketing-btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
            >
              Get {plan.name} <ArrowRight className="size-4" aria-hidden="true" />
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
        <h2 className="text-sm font-semibold">Included With Every Bot</h2>
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

      <dl className="grid gap-3 sm:grid-cols-6">
        {USAGE_RATE_LINES.map(([term, detail], index) => (
          <div
            key={term}
            className={`rounded-xl border border-border bg-card px-4 py-3 ${index < 3 ? "sm:col-span-2" : "sm:col-span-3"}`}
          >
            <dt className="text-sm font-semibold">{term}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
      <p className="text-center text-xs text-muted-foreground">
        Calls and Computer are measured by the second. Email is billed per sent reply. Limit alerts
        at 50%, 80%, and 100%.
      </p>
    </div>
  );
}
