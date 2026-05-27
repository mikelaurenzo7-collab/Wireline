/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  UserPlus,
  LogIn,
  AlertTriangle,
  Check,
  PhoneIncoming,
  PhoneOutgoing,
  MailCheck,
  Radio,
  Eye,
  EyeOff,
} from "lucide-react";
import { AuthDemoDirectory } from "./auth/AuthDemoDirectory";
import RoiCalculator from "./marketing/RoiCalculator";
import TrustSignals from "./marketing/TrustSignals";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "./WirelineMark";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
import {
  captureSignupIntentFromLocation,
  syncSignupIntent,
  type SignupIntent,
} from "../lib/signup-intent";
import { getPasswordPolicyError } from "../lib/password-policy";

const FEATURES = [
  {
    icon: PhoneIncoming,
    title: "Inbound Support",
    desc: "Agents pick up 24/7 — answer questions, route urgent calls, schedule appointments, and capture intent.",
    accent: "#4F1E7B",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound Sales",
    desc: "Upload a CSV, pick a playbook, launch auto-dial campaigns. Qualified meetings on your calendar by morning.",
    accent: "#4F1E7B",
  },
  {
    icon: MailCheck,
    title: "Email Agents",
    desc: "Agents triage your inbox, reply on-brand, follow up, and escalate the ones you need to see personally.",
    accent: "#4F1E7B",
  },
  {
    icon: Radio,
    title: "Live Monitor & Insights",
    desc: "Watch every conversation in real time. Sentiment, funnels, topic clusters, leaderboards — one dashboard.",
    accent: "#10B981",
  },
];

const AUTH_PORTAL_WIRELINE_AGENTS = WIRELINE_CONTACT_AGENTS.slice(0, -1);
const AUTH_PORTAL_DEMO_AGENTS = WIRELINE_DEMO_AGENTS.slice(0, -1);

/**
 * Normalize a JSON error payload into a human-readable string.
 *
 * Servers (and intermediate proxies / Vercel / Express defaults) can
 * return any of these shapes for an error body:
 *   { error: "Bad thing" }
 *   { error: { message: "Bad thing", code: "X" } }
 *   { error: { ... } }            // no message field
 *   { message: "Bad thing" }
 *   { ... }                       // no error/message at all
 *
 * If we naïvely do `throw new Error(j.error)` with an object value, the
 * Error constructor calls `String(obj)` which yields the dreaded
 * "[object Object]" — surfaced to the user as e.g.
 * "Google sign-in failed: [object Object]". This helper strips that
 * away and returns either a string or null (so the caller can fall
 * back to a status-aware default).
 */
function extractServerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [p.error, p.message, (p.error as any)?.message];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  // Last resort: serialize the error object so the user still sees
  // *something* useful, but never the literal "[object Object]".
  if (p.error && typeof p.error === "object") {
    try {
      const s = JSON.stringify(p.error);
      if (s && s !== "{}") return s.slice(0, 240);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Convert a thrown value into a clean string message. Filters out the
 * "[object Object]" sentinel that occurs when `new Error(someObject)`
 * was constructed somewhere upstream.
 */
function cleanThrownMessage(e: unknown): string | null {
  const raw = (e as { message?: unknown })?.message;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "[object Object]") return null;
  return trimmed;
}

function signupIntentLabel(intent: SignupIntent | null): string | null {
  if (!intent?.preferredPlanId && !intent?.signupWedge) return null;
  const parts = [];
  if (intent.preferredPlanId) parts.push(`${intent.preferredPlanId} plan`);
  if (intent.signupWedge) parts.push(intent.signupWedge.replace(/-/g, " "));
  return parts.join(" · ");
}

/**
 * Sign-in / sign-up shortcut row. Most business users have a Google
 * or Microsoft identity already; skipping the email-and-password
 * dance for them is a meaningful conversion lift. Buttons start the
 * server-side OAuth flow which round-trips back to /auth/oauth-complete.
 */
/**
 * Tiny live-stats pill that fetches /api/public/stats and renders
 * a "Live: N agents online · M calls this month" caption next to
 * the marketing stats strip. Hidden entirely below a credibility
 * threshold — at <5 agents the live ticker would read as
 * pre-revenue and tank trust. Once there are 5+ agents on the
 * platform it surfaces automatically.
 */
function LiveStatsTicker() {
  const [stats, setStats] = useState<{ agents_online: number; calls_this_month: number } | null>(
    null,
  );
  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);
  const agentsOnline = Number(stats?.agents_online ?? 0);
  if (agentsOnline < 5) return null;
  return (
    <>
      <div className="w-px h-6 bg-white/10" />
      <div className="flex flex-col">
        <span className="font-display italic text-2xl text-ink">
          {agentsOnline.toLocaleString()}
        </span>
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
          Agents on Wireline
        </span>
      </div>
    </>
  );
}

function OAuthSignInButtons({
  disabled,
  onError,
}: {
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState<"google" | "microsoft" | "yahoo" | null>(null);
  const start = async (provider: "google" | "microsoft" | "yahoo") => {
    if (disabled || pending) return;
    setPending(provider);
    onError?.("");
    try {
      const res = await fetch(`/api/auth/${provider}/url`, {
        headers: { Accept: "application/json" },
      });
      const contentType = res.headers.get("content-type") || "";
      let j: any = {};
      if (contentType.includes("application/json")) {
        try {
          j = await res.json();
        } catch {
          j = {};
        }
      } else {
        // Server returned HTML (e.g. Vercel/Express default error page).
        // Treat as a misconfiguration we should surface clearly.
        const bodySnippet = (await res.text().catch(() => "")).slice(0, 120);
        throw new Error(
          `Sign-in service returned ${res.status} ${res.statusText || ""}. ${bodySnippet ? `Details: ${bodySnippet}` : "The server may be misconfigured."}`.trim(),
        );
      }
      if (!res.ok) {
        const serverMsg = extractServerErrorMessage(j);
        throw new Error(
          serverMsg ||
            `Could not start ${provider} sign-in (HTTP ${res.status}). Please try again.`,
        );
      }
      const url = j?.url;
      if (typeof url !== "string" || !url.startsWith("http")) {
        throw new Error("Received invalid sign-in URL from server.");
      }
      window.location.assign(url);
    } catch (e: unknown) {
      setPending(null);
      const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
      const detail = cleanThrownMessage(e);
      const message = detail
        ? `${providerLabel} sign-in failed: ${detail}`
        : `${providerLabel} sign-in failed. Please try again or use email below.`;
      console.error("OAuth start failed", message);
      onError?.(message);
    }
  };
  // Per-provider visual: brand logo SVG + accent color. Renders as a
  // compact equal-width tile (icon stacked above tiny label) — the row
  // takes ~64px of vertical space total instead of the previous 3 × 44px
  // = 132px+ stacking on mobile. Lets the integration logo strip and
  // demo-agent grid above breathe instead of being crowded out.
  const providers: Array<{
    id: "google" | "microsoft" | "yahoo";
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "google",
      label: "Google",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
    },
    {
      id: "microsoft",
      label: "Microsoft",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#F25022" d="M1 1h10v10H1z" />
          <path fill="#7FBA00" d="M13 1h10v10H13z" />
          <path fill="#00A4EF" d="M1 13h10v10H1z" />
          <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
      ),
    },
    {
      id: "yahoo",
      label: "Yahoo",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#6001D2" d="M3 6h4.6l3 6 3-6h4.6l-5.9 11.3V21H9.9v-3.7L3 6z" />
          <circle cx="20" cy="13" r="2" fill="#6001D2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative z-10 space-y-3 mb-5">
      {/* OAuth row — on 360-390px the prior 3-col gap-2 squeezed each
          tile to ~85px width with sub-44px touch comfort. Bumping gap
          and slightly more vertical padding keeps the three providers
          balanced AND iOS-tap-target compliant. */}
      <div className="grid grid-cols-3 gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => start(p.id)}
            disabled={disabled || !!pending}
            aria-label={`Continue with ${p.label}`}
            title={`Continue with ${p.label}`}
            className="min-h-[56px] sm:min-h-[60px] py-3 inline-flex flex-col items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white/70 text-ink text-[10px] sm:text-[11px] uppercase tracking-[0.18em] font-medium hover:border-[#4F1E7B]/40 hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {pending === p.id ? <Loader2 className="w-5 h-5 animate-spin" /> : p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="flex-1 h-px bg-black/8" />
        <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-muted/60 font-medium">
          or with email
        </span>
        <span className="flex-1 h-px bg-black/8" />
      </div>
    </div>
  );
}

type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function getPasswordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const meta: Record<number, { label: string; color: string }> = {
    0: { label: "Too short", color: "#FF6B6B" },
    1: { label: "Weak", color: "#FF9A5C" },
    2: { label: "Fair", color: "#FFD166" },
    3: { label: "Good", color: "#4DFFC4" },
    4: { label: "Strong", color: "#4F1E7B" },
  };
  return { score: clamped, ...meta[clamped] };
}

type AuthMode = "signin" | "signup" | "reset";

export default function AuthPortal() {
  const { signIn } = useAuth();
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  // Default mode matches the URL the user landed on. /signup → signup
  // form, /signin or anything else (including "/") → signin form.
  // AuthPortal is the public home page now, so "/" defaults to signin.
  const initialMode: AuthMode = (() => {
    if (typeof window === "undefined") return "signin";
    return pathname === "/signup" ? "signup" : "signin";
  })();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signupIntent, setSignupIntent] = useState<SignupIntent | null>(() =>
    captureSignupIntentFromLocation(),
  );

  const isSignUp = mode === "signup";
  const isReset = mode === "reset";
  const pwStrength = isSignUp ? getPasswordStrength(password) : null;
  const intentLabel = signupIntentLabel(signupIntent);

  useEffect(() => {
    setSignupIntent(captureSignupIntentFromLocation());
  }, []);

  const setIsSignUp = (v: boolean) => {
    setMode(v ? "signup" : "signin");
    setError(null);
    setMessage(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    // RFC-5322-ish — good enough for client-side; server is authoritative.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isReset && !password) {
      setError("Password is required.");
      return;
    }
    const passwordPolicyError = isSignUp ? getPasswordPolicyError(password) : null;
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      return;
    }

    setLoading(true);
    try {
      if (isReset) {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail }),
        });
        let data: any = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (!res.ok) {
          // Non-JSON or error body — use status-aware message
          const serverMsg = extractServerErrorMessage(data);
          const msg =
            serverMsg ||
            (res.status >= 500
              ? "Server temporarily unavailable. Please try again shortly."
              : "Password reset request failed");
          throw new Error(msg);
        }
        setMessage(data.message || "If that email is registered, a reset link is on its way.");
      } else {
        const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/signin";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
            ...(isSignUp && signupIntent
              ? {
                  preferredPlanId: signupIntent.preferredPlanId,
                  signupWedge: signupIntent.signupWedge,
                  utmSource: signupIntent.utmSource,
                  utmMedium: signupIntent.utmMedium,
                  utmCampaign: signupIntent.utmCampaign,
                }
              : {}),
          }),
        });

        let data: any = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (!res.ok) {
          const serverMsg = extractServerErrorMessage(data);
          const msg =
            serverMsg ||
            (res.status >= 500
              ? "Server temporarily unavailable. Please try again shortly."
              : "Authentication failed");
          throw new Error(msg);
        }

        await syncSignupIntent(signupIntent, data.token).catch(() => {});
        signIn({
          access_token: data.token,
          user: data.user,
        });
      }
    } catch (err: unknown) {
      setError(cleanThrownMessage(err) || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta
        title={
          pathname === "/"
            ? "Wireline — AI Voice & Email Agents for Every Business"
            : isReset
              ? "Reset Password"
              : isSignUp
                ? "Create Account"
                : "Sign In"
        }
        description={
          pathname === "/"
            ? "Deploy AI voice + email agents on real phone numbers in under 10 minutes. Handle inbound calls, qualify leads, book appointments, send SMS follow-ups, and sync with your CRM."
            : isSignUp
              ? "Start your 14-day free Wireline trial — deploy an AI voice agent in under 10 minutes. No credit card required."
              : "Sign in to your Wireline operator console to manage your AI voice agents, call logs, and outbound campaigns."
        }
        path={pathname === "/" ? "/" : pathname === "/signup" ? "/signup" : undefined}
        noIndex={pathname !== "/"}
      />
      <div className="min-h-dvh flex relative overflow-hidden bg-paper">
        {/* Global parchment backdrop matching Claude.ai */}
        <div className="pointer-events-none fixed inset-0 z-0 bg-paper" />
        <div className="scanline" />

        {/* ── LEFT PANEL — brand showcase ───────────────────────────────────────
           min-h-dvh + overflow-y-auto so the agent showcase + integration
            strip don't push the whole layout taller than the viewport.
            Without this, the left column at lg+ widths grows to ~1020px,
            making the Sign In button on the right scroll-required even
           though it's anchored to the top of its column. */}
        <div className="hidden lg:flex lg:w-[52%] xl:w-[54%] flex-col relative z-10 p-6 lg:p-8 xl:p-10 lg:min-h-dvh overflow-y-auto scrollbar-hide">
          {/* Decorative vertical line on right edge */}
          <div
            className="absolute top-0 right-0 w-px h-full"
            style={{
              background:
                "linear-gradient(to bottom, transparent, rgba(217,119,82,0.2) 30%, rgba(217,119,82,0.2) 70%, transparent)",
            }}
          />

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4 mb-6 xl:mb-8"
          >
            <div
              className="relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: "#4F1E7B",
                boxShadow:
                  "0 8px 24px -8px rgba(79,30,123,0.4), 0 0 0 1px rgba(255,255,255,0.22) inset",
              }}
            >
              <WirelineMark className="w-6 h-6 text-on-brand" strokeWidth={130} />
            </div>
            <div>
              <span className="brand-wordmark text-3xl xl:text-4xl leading-none !text-[#4F1E7B] !filter-none">
                WIRELINE
              </span>
              <p className="text-[9px] xl:text-[10px] tracking-[0.42em] uppercase text-muted mt-1">
                AI Voice + Email Platform
              </p>
            </div>
          </motion.div>

          {/* Hero copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 xl:mb-8"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
              <span className="text-[8px] uppercase tracking-[0.5em] text-muted/70">
                One fleet, every channel
              </span>
            </div>
            <h1 className="font-display italic text-4xl xl:text-5xl 2xl:text-6xl leading-[1.0] xl:leading-[0.92] tracking-tight mb-4 text-balance">
              <span className="text-[#4F1E7B]">AI agents for every</span>
              <br />
              <span className="text-ink">customer conversation</span>
            </h1>
            <p className="text-[13px] xl:text-sm text-muted/80 leading-relaxed max-w-xl mb-5">
              Wireline runs your <span className="text-ink/90">inbound support</span>,{" "}
              <span className="text-ink/90">outbound sales</span>, and{" "}
              <span className="text-ink/90">email follow-ups</span> across one fleet of AI agents —
              trained on your playbook, available 24/7, improving with every interaction.
            </p>
            {/* Value props — honest capability statements, not fabricated
              vanity metrics. The old "10M+ calls / $150M pipeline /
              4.9 CSAT" trio was invented; replaced with claims that are
              true on day one. LiveStatsTicker still shows the REAL
              agents-online / calls-this-month counts when the platform
              has data. */}
            <div className="flex items-center gap-5">
              <div className="flex flex-col">
                <span className="font-display italic text-2xl text-ink">24/7</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                  Always Answering
                </span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex flex-col">
                <span className="font-display italic text-2xl text-ink">&lt;10 min</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                  Setup To First Call
                </span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex flex-col">
                <span className="font-display italic text-2xl text-ink">Every</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                  Call Picked Up
                </span>
              </div>
              <LiveStatsTicker />
            </div>
          </motion.div>

          {/* Product pillars — compact grid; demos live in collapsible directory below. */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8"
          >
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl p-3.5 border border-black/5 bg-[#FAF8F5]/80"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2 border border-black/5 bg-[#4F1E7B]/10 text-[#4F1E7B]">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[11px] font-medium text-ink mb-0.5">{f.title}</p>
                    <p className="text-[10px] text-muted/70 leading-snug">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <AuthDemoDirectory
            wirelineAgents={AUTH_PORTAL_WIRELINE_AGENTS}
            demoAgents={AUTH_PORTAL_DEMO_AGENTS}
            defaultExpanded={false}
            className="mb-6"
          />

          {/* ROI Calculator — the conversion moment. Lets prospects
              plug their own numbers in and watch Wireline pay back. */}
          <RoiCalculator />

          {/* Trust signals — verticals + security/compliance badges.
              Replaces the previous one-line "TLS Encrypted" trust row
              with proper density: 8 verticals, 5 compliance badges,
              live system-status pill. Cheap real estate, big trust lift. */}
          <TrustSignals />

          {/* Trust row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-auto flex items-center gap-6"
          >
            <div className="flex items-center gap-2 text-muted/60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[9px] uppercase tracking-[0.38em]">TLS Encrypted</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-2 text-muted/60">
              <div className="relative w-2 h-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 absolute inset-0 dot-online" />
              </div>
              <span className="text-[9px] uppercase tracking-[0.38em]">Carrier-Grade Infra</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <Link
              to="/pricing"
              className="text-[9px] uppercase tracking-[0.38em] text-muted/60 hover:text-ink transition-colors"
            >
              Pricing →
            </Link>
          </motion.div>
        </div>

        {/* ── RIGHT PANEL — auth form ────────────────────────────────────────────
           Anchored to the top (not vertically centered) so the Sign In
           button is reliably above the fold at 1280×800 / 1366×768 laptops.
           Previously `justify-center` pushed the form to ~440px from the top
           of an 800px viewport, putting the Sign In button at ~875px —
           below the fold. */}
        <div className="flex-1 lg:sticky lg:top-0 lg:min-h-dvh flex flex-col items-center justify-start relative z-10 py-5 sm:py-8 px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 overflow-y-auto native-scroll overscroll-y-contain">
          {/* ── Aurora wash ──────────────────────────────────────────
              Decorative animated gradients that breathe behind the
              form column. Purely cosmetic — pointer-events-none and
              aria-hidden. Mobile + desktop friendly: the radial blobs
              scale with the viewport so they never tile or repeat.
              Two layers crossfade on a 14s/19s offset so the motion
              never feels mechanical. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden -z-10"
          >
            {/* Layer A — top-right brand-purple bloom */}
            <div
              className="absolute -top-20 -right-24 w-[420px] h-[420px] rounded-full opacity-[0.55] mix-blend-multiply animate-[wireline-aurora-a_14s_ease-in-out_infinite_alternate]"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(79,30,123,0.22), rgba(79,30,123,0.06) 55%, transparent 80%)",
                filter: "blur(28px)",
              }}
            />
            {/* Layer B — bottom-left warm amber glow */}
            <div
              className="absolute -bottom-32 -left-24 w-[480px] h-[480px] rounded-full opacity-50 mix-blend-multiply animate-[wireline-aurora-b_19s_ease-in-out_infinite_alternate]"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(217,119,82,0.18), rgba(217,119,82,0.05) 55%, transparent 80%)",
                filter: "blur(32px)",
              }}
            />
            {/* Layer C — center cream wash, anchors readability */}
            <div
              className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[280px] rounded-[50%] opacity-60"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(239,233,220,0.65), rgba(239,233,220,0.18) 60%, transparent 80%)",
                filter: "blur(40px)",
              }}
            />
            {/* Subtle grain — same warm noise as the rest of the cream
                surfaces. 2.5% opacity keeps it imperceptible-but-felt. */}
            <div
              className="absolute inset-0 opacity-[0.025] mix-blend-multiply"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
              }}
            />
          </div>
          <div className="lg:hidden w-full max-w-md mb-4 pt-1">
            {/* Logo + wordmark row */}
            <div className="flex items-center gap-3.5 mb-5">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "#4F1E7B",
                  boxShadow: "0 8px 24px -8px rgba(79,30,123,0.4)",
                }}
              >
                <WirelineMark className="w-6 h-6 text-on-brand" strokeWidth={130} />
              </div>
              <div>
                <span className="brand-wordmark text-3xl leading-none !text-[#4F1E7B] !filter-none">
                  WIRELINE
                </span>
                <p className="text-[9px] tracking-[0.42em] uppercase text-muted mt-1">
                  AI Voice + Email Platform
                </p>
              </div>
            </div>
            {/* Hero copy */}
            <h1 className="type-fluid-hero font-display italic leading-snug tracking-tight mb-3 text-balance">
              <span className="text-[#4F1E7B]">AI agents for every</span>{" "}
              <span className="text-ink">customer conversation</span>
            </h1>
            <p className="type-fluid-body text-muted/80">
              Sign in below — try live demo lines anytime after the form.
            </p>
          </div>

          {/* Mobile logo — retained for the form-card width reference, hidden visually below hero */}
          <div className="hidden">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "#4F1E7B",
                boxShadow: "0 16px 40px -10px rgba(79, 30, 123 ,0.55)",
              }}
            >
              <WirelineMark className="w-8 h-8 text-on-brand" strokeWidth={120} />
            </div>
            <h1 className="brand-wordmark text-5xl leading-none">WIRELINE</h1>
            <p className="text-[9px] uppercase tracking-[0.5em] text-muted">
              AI Voice + Email Platform
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            {/* Form card */}
            <div
              className="relative rounded-2xl sm:rounded-3xl border border-black/8 bg-[#FAF8F5] overflow-hidden"
              style={{
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.9) inset, 0 20px 50px -24px rgba(79, 30, 123, 0.22), 0 8px 24px -12px rgba(0,0,0,0.12)",
              }}
            >
              <div className="relative p-6 sm:p-7 md:p-9 lg:p-10">
                {/* Header */}
                <div className="relative z-10 mb-9">
                  <h2 className="font-display italic text-3xl text-ink leading-tight mb-1">
                    {isReset ? "Reset password" : isSignUp ? "Create account" : "Welcome back"}
                  </h2>
                  <p className="text-[11px] text-muted/70">
                    {isReset
                      ? "Enter your email and we'll send you a reset link."
                      : isSignUp
                        ? "Start your 14-day free trial. No credit card required."
                        : "Sign in to your Wireline operator console."}
                  </p>
                  {isSignUp && intentLabel && (
                    <p className="mt-2 inline-flex rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[9px] uppercase tracking-[0.26em] text-brand">
                      Matched from your visit · {intentLabel}
                    </p>
                  )}
                </div>

                {/* Tab toggle — hidden in reset mode */}
                {!isReset && (
                  <div className="relative z-10 mb-7">
                    <div className="relative flex p-1 rounded-2xl bg-black/5 border border-black/5">
                      <motion.div
                        layout
                        className="absolute inset-y-1 w-[calc(50%-4px)] rounded-xl"
                        style={{
                          background: "rgba(79, 30, 123, 0.12)",
                          border: "1px solid rgba(79, 30, 123, 0.25)",
                          left: isSignUp ? "calc(50% + 2px)" : "4px",
                          boxShadow: "0 4px 12px -4px rgba(79, 30, 123, 0.2)",
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 34 }}
                      />
                      {[
                        { label: "Sign In", value: false },
                        { label: "Sign Up", value: true },
                      ].map((opt) => (
                        <button
                          key={String(opt.value)}
                          onClick={() => setIsSignUp(opt.value)}
                          className={cn(
                            "relative z-10 flex-1 py-3 text-[11px] uppercase tracking-[0.3em] transition-colors",
                            isSignUp === opt.value ? "text-ink" : "text-muted hover:text-ink/70",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* OAuth sign-in — Continue with Google / Microsoft.
                  Skips the email-and-password flow entirely for the 80%
                  of business users who already have a Google or Outlook
                  identity. Email-and-password stays below for everyone
                  else. The buttons hide for the password-reset mode
                  since OAuth doesn't apply there. */}
                {!isReset && (
                  <OAuthSignInButtons
                    disabled={loading}
                    onError={(m) => {
                      // Empty string clears (called at the start of each attempt);
                      // non-empty surfaces the failure in the form's error slot
                      // so the user actually sees what went wrong.
                      setError(m || null);
                    }}
                  />
                )}

                <form onSubmit={handleAuth} className="relative z-10 space-y-4">
                  {/* Email */}
                  <div className="space-y-2">
                    <label
                      htmlFor="auth-email"
                      className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5"
                    >
                      <Mail className="w-3 h-3 text-[#4F1E7B]" />
                      Email
                    </label>
                    <div className="relative group">
                      <input
                        id="auth-email"
                        type="email"
                        required
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input"
                        placeholder="operator@company.io"
                      />
                      <div
                        className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity"
                        style={{
                          boxShadow:
                            "0 0 0 1px rgba(79,30,123,0.45), 0 0 20px rgba(79,30,123,0.15)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Password — hidden in reset mode */}
                  {!isReset && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="auth-password"
                          className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5"
                        >
                          <Lock className="w-3 h-3 text-[#4F1E7B]" />
                          Password
                        </label>
                        {!isSignUp && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode("reset");
                              setError(null);
                              setMessage(null);
                            }}
                            className="text-[9px] uppercase tracking-[0.3em] text-muted/60 hover:text-[#4F1E7B] transition-colors"
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                      <div className="relative group">
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={isSignUp ? 8 : undefined}
                          autoComplete={isSignUp ? "new-password" : "current-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="auth-input tracking-[0.32em] pr-10"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/60 hover:text-ink transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        <div
                          className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity"
                          style={{
                            boxShadow:
                              "0 0 0 1px rgba(79,30,123,0.45), 0 0 20px rgba(79,30,123,0.15)",
                          }}
                        />
                      </div>
                      {/* Password strength meter — sign-up only */}
                      {isSignUp && password.length > 0 && pwStrength && (
                        <div className="space-y-1.5">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className="h-1 flex-1 rounded-full transition-all duration-300"
                                style={{
                                  background:
                                    i <= pwStrength.score ? pwStrength.color : "rgba(0,0,0,0.06)",
                                }}
                              />
                            ))}
                          </div>
                          <p
                            className="text-[9px] uppercase tracking-[0.3em]"
                            style={{ color: pwStrength.color }}
                          >
                            {pwStrength.label}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reset-mode footer — link back to sign-in */}
                  {isReset && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-[10px] uppercase tracking-[0.3em] text-muted/60 hover:text-[#4F1E7B] transition-colors"
                    >
                      ← Back to sign in
                    </button>
                  )}

                  {/* Feedback messages */}
                  <AnimatePresence mode="wait">
                    {error && (
                      <motion.div
                        role="alert"
                        key="error"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{error}</span>
                      </motion.div>
                    )}
                    {message && (
                      <motion.div
                        key="msg"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs"
                      >
                        <Check className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{message}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Terms & Privacy — required for signup only (legal + trust) */}
                  {isSignUp && (
                    <label className="flex items-start gap-2 text-[10px] text-muted/70 leading-snug cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-0.5 accent-[#4F1E7B]"
                        required
                      />
                      <span>
                        I agree to the{" "}
                        <Link to="/legal/terms" className="underline hover:text-ink">
                          Terms
                        </Link>{" "}
                        and{" "}
                        <Link to="/legal/privacy" className="underline hover:text-ink">
                          Privacy Policy
                        </Link>
                        .
                      </span>
                    </label>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading || (isSignUp && !agreedToTerms)}
                    className="native-tap-squish w-full flex items-center justify-center gap-2 py-4 px-6 text-[12px] tracking-[0.3em] uppercase font-medium rounded-full cursor-pointer text-on-brand bg-[#4F1E7B] hover:bg-[#6A25A3] max-md:hover:translate-y-0 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                    style={{
                      boxShadow: "0 4px 12px -2px rgba(79,30,123,0.3)",
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Connecting…
                      </>
                    ) : isReset ? (
                      <>
                        <Mail className="w-4 h-4" /> Send Reset Link{" "}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : isSignUp ? (
                      <>
                        <UserPlus className="w-4 h-4" /> Create Account{" "}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" /> Sign In <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            <AuthDemoDirectory
              wirelineAgents={AUTH_PORTAL_WIRELINE_AGENTS}
              demoAgents={AUTH_PORTAL_DEMO_AGENTS}
              defaultExpanded={false}
              className="mt-6 lg:hidden"
            />

            {/* Footer */}
            <div className="mt-6 flex items-center justify-center gap-4">
              <ShieldCheck className="w-3 h-3 text-muted/40" />
              <span className="text-[9px] uppercase tracking-[0.42em] text-muted/50">
                TLS Encrypted · Secured Internal Infrastructure
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
