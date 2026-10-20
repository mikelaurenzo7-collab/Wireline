import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { FLAT_OVERAGE_PER_MIN_USD, STRIPE_PLANS } from "../lib/plan-catalog";
import {
  DEFAULT_ACTIVATION_PLAN_ID,
  getStoredSignupIntent,
  mergeSignupIntent,
  parseSignupIntent,
  persistSignupIntent,
  signupHrefForPlan,
  type SignupPlanId,
} from "../lib/signup-intent";
import BillingIntervalControl from "../components/BillingIntervalControl";
import ChannelPlanPicker from "../components/ChannelPlanPicker";
import { usePaidPlanAvailability } from "../hooks/usePaidPlanAvailability";

const CHANNEL_PLANS = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels");
const TOPUP_RATE = `$${FLAT_OVERAGE_PER_MIN_USD.toFixed(2)}/min`;
const FAQ = [
  [
    "What Changes with Capacity?",
    "Light, Regular, and High keep the same Bot and selected channels. Calls include 50, 250, or 500 minutes each month; Email and SMS allowances increase with capacity. Each package shows its included usage and price.",
  ],
  [
    "Can One Bot Use Several Channels?",
    "Yes. Choose Calls, Email, SMS, or any combination. Your selected channels share the Bot's knowledge and rules. SMS selections are for private planning and rehearsal; live activation requests receive a setup review.",
  ],
  [
    "When Does Included Usage Reset?",
    "Call minutes and managed AI allowances renew on your monthly subscription anniversary, including annual plans. Billing shows your next reset date. Unused included usage does not roll over.",
  ],
  [
    "Which Plans Include a Phone Number?",
    "Calls and SMS packages include one local number. One new number per included line is available every 31 days; releasing a number does not reset that limit. Email-only does not require a phone number. Free Builder does not receive live numbers.",
  ],
  [
    "What Happens When Included Call Minutes Run Out?",
    `Extra calling uses prepaid Runtime Balance at ${TOPUP_RATE}. Each call requires at least one funded minute and is limited by available coverage, plus a completion buffer of up to 10 minutes, within the 60-minute session cap. Unpaid completion usage pauses new calls and prepaid extras until you top up. Billing and saved records stay available. No automatic top-ups or overage invoices.`,
  ],
  [
    "How Long Can a Call Last?",
    "Live phone calls can run for up to 60 minutes per session, unless a shorter limit is configured. Private browser rehearsals and message-taking flows have a 5-minute maximum. Reaching a session limit ends the call.",
  ],
  [
    "How Is Email Usage Covered?",
    "Email packages include a Bot mailbox and the allowance shown in the selected package. AI and message processing consume allowance; no unlimited message count is promised. Connected Gmail, Outlook, and iCloud accounts remain optional inputs.",
  ],
  [
    "Can I Cancel or Get a Refund?",
    "Cancel from BotBound Billing anytime; access continues through the current billing period. Contact support@botbound.app within 30 days of your first paid invoice to request a first-invoice subscription refund. We verify the account and transaction before confirming.",
  ],
] as const;

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

export default function Pricing() {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    () =>
      parseSignupIntent(window.location.search)?.preferredBillingInterval ??
      getStoredSignupIntent()?.preferredBillingInterval ??
      "month",
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    const requested =
      parseSignupIntent(window.location.search)?.preferredPlanId ??
      getStoredSignupIntent()?.preferredPlanId;
    return CHANNEL_PLANS.some((plan) => plan.id === requested)
      ? requested!
      : DEFAULT_ACTIVATION_PLAN_ID;
  });
  const selectPlan = (id: string, interval = billingInterval) => {
    setSelectedPlanId(id);
    persistSignupIntent(
      mergeSignupIntent(getStoredSignupIntent(), {
        preferredPlanId: id as SignupPlanId,
        preferredBillingInterval: interval,
        capturedAt: new Date().toISOString(),
      }),
    );
  };
  const { canActivate, emailSetupReview, notice } = usePaidPlanAvailability({
    interval: billingInterval,
    planId: selectedPlanId,
  });
  const selectedHasCalls =
    CHANNEL_PLANS.find((plan) => plan.id === selectedPlanId)?.channels.includes("voice") === true;
  return (
    <MarketingPageFrame className="wl-pricing-page" stickyCta>
      <PageMeta
        title="Pricing | Build Free, Add Calls or Email | BotBound"
        description="Build and rehearse a Bot for free. Compare Calls, Email, and combined plans, including their monthly usage and live activation options."
        path="/pricing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <section id="plans" className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-5xl">
          <div className="mx-auto mb-6 max-w-3xl text-center">
            <p className="wl-eyebrow wl-eyebrow--wired text-primary">Pricing</p>
            <h1 className="marketing-hero-title mx-auto mt-4 min-w-0 max-w-full text-[clamp(1.9rem,3.4vw,2.9rem)] [overflow-wrap:anywhere]">
              Only the Channels You Need
            </h1>
            <p className="marketing-hero-lead mx-auto mt-4">
              One Bot. Your channels. The capacity you need.
            </p>
          </div>
          <div className="mx-auto max-w-2xl">
            <div className="wl-pricing-interval-row mb-4 flex flex-wrap items-center justify-center gap-3 sm:justify-between">
              <p className="w-full text-center text-sm text-muted-foreground sm:w-auto sm:text-left">
                Plans from $9/month
              </p>
              <BillingIntervalControl
                value={billingInterval}
                onChange={(interval) => {
                  selectPlan(selectedPlanId, interval);
                  setBillingInterval(interval);
                }}
              />
            </div>
            <ChannelPlanPicker
              id="pricing"
              plans={CHANNEL_PLANS}
              selectedPlanId={selectedPlanId}
              onSelectPlan={selectPlan}
              interval={billingInterval}
              renderAction={(plan) => {
                const selected = CHANNEL_PLANS.find((item) => item.id === plan.id)!;
                const smsPending = selected.checkoutAvailability === "sms_readiness_required";
                return (
                  <div className="space-y-3">
                    <p role="status" className="text-sm text-muted-foreground">
                      {smsPending
                        ? "Plan and rehearse an SMS Bot privately. Ask us to review what live activation would require."
                        : notice}
                    </p>
                    <Link
                      to={signupHrefForPlan(plan.id as SignupPlanId, { interval: billingInterval })}
                      className="marketing-btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
                    >
                      {canActivate(plan.id) && !smsPending
                        ? "Get Started"
                        : emailSetupReview || smsPending
                          ? "Create a Free Bot"
                          : "Set Up These Channels"}{" "}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                    {emailSetupReview || smsPending ? (
                      <Link
                        to={smsPending ? "/contact?topic=sms" : "/contact?topic=email"}
                        className="inline-flex min-h-11 w-full items-center justify-center px-4 text-sm font-semibold text-primary underline underline-offset-4"
                      >
                        {smsPending ? "Ask About SMS Setup" : "Ask About Email Checkout"}
                      </Link>
                    ) : null}
                  </div>
                );
              }}
            />
            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
              Included usage is shown per month. No automatic top-ups or overage invoices.
              {selectedHasCalls ? (
                <>
                  {" "}
                  Extra minutes cost {TOPUP_RATE}, using Runtime Balance or completion credit. Bots
                  answer and place calls from their own number.
                </>
              ) : null}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="text-left">
                <h2 className="text-base font-semibold">Start with Free Builder</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  One private Bot. Set it up, add knowledge, and rehearse before activation.
                </p>
              </div>
              <Link
                to={signupHrefForPlan("personal")}
                className="marketing-btn-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
              >
                Create a Free Bot <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <article
              id="scale"
              className="mt-6 flex scroll-mt-24 flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-left">
                <h2 className="text-lg font-semibold">More Bots or a Custom Setup?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Talk through capacity, integrations, and rollout with us.
                </p>
              </div>
              <Link
                to="/contact?topic=enterprise"
                className="marketing-btn-secondary inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold"
              >
                Contact Us
              </Link>
            </article>
          </div>
          <details className="pricing-more group mx-auto mt-4 w-full">
            <summary className="pricing-more__summary wl-focus-ring-halo mx-auto flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground marker:hidden">
              Usage Details &amp; FAQs{" "}
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="pricing-more__body mt-3 grid gap-3 md:grid-cols-2">
              {FAQ.map(([question, answer]) => (
                <details
                  key={question}
                  className="h-fit rounded-xl border border-border bg-card px-4 py-3"
                >
                  <summary className="cursor-pointer text-sm font-semibold">{question}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Review setup and safeguards in the{" "}
              <Link to="/trust" className="text-primary underline underline-offset-4">
                Trust Center
              </Link>
              .
            </p>
          </details>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
