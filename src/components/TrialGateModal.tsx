/**
 * TrialGateModal — the conversion-closing UX for the trial gate.
 *
 * Listens for the global `wireline:trial-gate-block` window event
 * (emitted by authFetch in src/lib/api.ts on 402 responses with a
 * TRIAL_* / SUBSCRIPTION_REQUIRED code) and renders an inline tier
 * picker with one-click Stripe checkout. Without this component the
 * trial gate fires 402s but the user just sees a generic API error
 * — no path to paying.
 *
 * Mounted once in AppShell (src/components/layout/AppShell.tsx) so
 * it works regardless of which page surfaced the 402.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, CreditCard, AlertTriangle, Sparkles } from "lucide-react";
import { authFetch, safeJson, TRIAL_GATE_EVENT, type TrialGateBlockDetail } from "../lib/api";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { getStoredSignupIntent, recommendedPlanFromIntent } from "../lib/signup-intent";

/**
 * Self-serve tiers we surface in the picker. Enterprise is intentionally
 * not in the picker — it's contact-sales only (price_usd_monthly = 0)
 * and goes through the checkout endpoint with a 400.
 */
const SELF_SERVE_TIERS = [
  {
    id: "personal",
    label: "Personal",
    price: 49,
    pitch: "Solo operator · 1 agent · dedicated number",
  },
  {
    id: "starter",
    label: "Starter",
    price: 149,
    pitch: "Small team · 3 agents · CRM sync · best for most",
    recommended: true,
  },
  {
    id: "pro",
    label: "Pro",
    price: 499,
    pitch: "Growing org · 10 agents · supervisor cockpit",
  },
  {
    id: "business",
    label: "Business",
    price: 1499,
    pitch: "Multi-team · 25 agents · priority support",
  },
];

function headlineForCode(detail: TrialGateBlockDetail): { title: string; body: string } {
  switch (detail.code) {
    case "EMAIL_UNVERIFIED":
      return {
        title: "Verify your email first",
        body: "We sent you a link from Wireline — click it to unlock outbound dialing and create more agents. Check your inbox and spam folder; you can resend from the banner at the top.",
      };
    case "TRIAL_LIMIT_HIT":
      return {
        title: "Trial limit reached",
        body:
          typeof detail.limit === "number" && typeof detail.current === "number"
            ? `You've used ${detail.current} of ${detail.limit} during your free trial. Pick a plan to keep going — your data and agent stay exactly as they are.`
            : "You've hit your trial limit. Pick a plan to keep going.",
      };
    case "TRIAL_EXPIRED":
      return {
        title: "Your 14-day trial just ended",
        body: "Pick a plan to keep your agent live. Your number, settings, and call history stay exactly as you left them.",
      };
    case "SUBSCRIPTION_REQUIRED":
      return {
        title: "Subscription paused",
        body: "Your subscription is past due — pick a plan or update your card to keep your agent live.",
      };
    default:
      return { title: "Upgrade required", body: detail.error };
  }
}

export default function TrialGateModal() {
  const [detail, setDetail] = useState<TrialGateBlockDetail | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pin the page underneath while the upgrade modal is open.
  useBodyScrollLock(detail !== null);

  // Subscribe to the global trial-gate event. Single listener mounted
  // for the lifetime of the AppShell. Reentry-safe: the most recent
  // 402 replaces the previous one rather than queueing modals.
  useEffect(() => {
    const onBlock = (e: Event) => {
      const ce = e as CustomEvent<TrialGateBlockDetail>;
      if (!ce.detail) return;
      setDetail(ce.detail);
      setError(null);
    };
    window.addEventListener(TRIAL_GATE_EVENT, onBlock);
    return () => window.removeEventListener(TRIAL_GATE_EVENT, onBlock);
  }, []);

  // Esc closes the modal without changing plans.
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  if (!detail) return null;

  const { title, body } = headlineForCode(detail);
  const recommendedPlanId = recommendedPlanFromIntent(getStoredSignupIntent());

  async function checkout(planId: string) {
    setPending(planId);
    setError(null);
    try {
      const r = await authFetch("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan_id: planId }),
      });
      const data = (await safeJson<{ url?: string; error?: string }>(r)) as {
        url?: string;
        error?: string;
      } | null;
      const checkoutUrl = data?.url;
      if (!r.ok || !checkoutUrl) {
        setError(data?.error || "Checkout couldn't be opened. Try again or contact support.");
        setPending(null);
        return;
      }
      // Dispatch analytics checkout initiation events
      if (typeof window !== "undefined") {
        try {
          const prices: Record<string, number> = {
            personal: 49,
            starter: 149,
            pro: 499,
            business: 1499,
          };
          const w = window as unknown as {
            fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
            dataLayer?: { push: (data: Record<string, unknown>) => void };
          };
          if (typeof w.fbq === "function") {
            w.fbq("track", "InitiateCheckout", {
              content_category: "Subscription",
              content_ids: [planId],
              value: prices[planId] || 0,
              currency: "USD",
            });
          }
          if (typeof window.plausible === "function") {
            window.plausible("CheckoutInitiated", { props: { plan: planId } });
          }
          if (w.dataLayer && typeof w.dataLayer.push === "function") {
            w.dataLayer.push({ event: "checkout_initiated", planId: planId });
          }
        } catch (err) {
          console.error("[wireline:analytics] Failed to log checkout initiation:", err);
        }
      }

      // Stripe-hosted checkout redirect. Full navigation, not a popup,
      // so the success/cancel URLs return the user to the right place.
      window.location.href = checkoutUrl;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error opening checkout.");
      setPending(null);
    }
  }

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-0 sm:px-4 sm:py-6 bg-black/55 backdrop-blur-sm"
          style={{
            paddingTop: "env(safe-area-inset-top, 0)",
            paddingBottom: "env(safe-area-inset-bottom, 0)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trial-gate-title"
        >
          <motion.div
            // Bottom-sheet on mobile (slides up from bottom edge,
            // rounded only on top), centered card on desktop. Same
            // pattern ConfirmModal uses for consistency across the
            // app's modal surface.
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-3xl rounded-t-3xl sm:rounded-3xl bg-paper border border-black/10 shadow-2xl overflow-y-auto overscroll-contain max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-0.75rem)]"
          >
            <button
              onClick={() => setDetail(null)}
              aria-label="Close"
              className="absolute top-4 right-4 w-11 h-11 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-6 sm:px-8 pt-8 pb-6">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-brand mb-3 font-medium">
                <Sparkles className="w-3 h-3" />
                Upgrade to keep going
              </div>
              <h2
                id="trial-gate-title"
                className="font-display italic text-2xl sm:text-3xl text-ink mb-2 text-balance"
              >
                {title}
              </h2>
              <p className="text-sm sm:text-base text-ink/75 max-w-xl leading-relaxed">{body}</p>
            </div>

            <div className="px-6 sm:px-8 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {SELF_SERVE_TIERS.map((tier) => {
                  const isPending = pending === tier.id;
                  const isRecommended = tier.id === recommendedPlanId;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => checkout(tier.id)}
                      disabled={!!pending}
                      className={cn(
                        "relative text-left rounded-2xl border p-4 transition-all touch-manipulation",
                        isRecommended
                          ? "border-brand/50 bg-brand/5 hover:border-brand hover:bg-brand/10"
                          : "border-black/10 hover:border-brand/30 hover:bg-black/3",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {isRecommended && (
                        <div className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-brand text-on-brand text-[9px] uppercase tracking-[0.2em] font-medium">
                          Recommended
                        </div>
                      )}
                      <div className="font-display italic text-lg text-ink mb-1">{tier.label}</div>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="font-display italic text-2xl text-ink">${tier.price}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted/70">
                          /mo
                        </span>
                      </div>
                      <p className="text-[11px] text-ink/65 leading-relaxed mb-3">{tier.pitch}</p>
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-brand">
                        {isPending ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Opening
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-3 h-3" />
                            Pick {tier.label}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 text-xs text-rose-600 leading-relaxed"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted/70">
                <span>Phone number stays included</span>
                <span>·</span>
                <span>Cancel anytime</span>
                <span>·</span>
                <a
                  href="mailto:trywireline@yahoo.com?subject=Enterprise%20pricing"
                  className="text-brand hover:text-brand/80 transition-colors"
                >
                  Need Enterprise? →
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
