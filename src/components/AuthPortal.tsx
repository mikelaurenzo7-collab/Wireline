import React, { useState } from "react";
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
  Waves,
  Check,
  PhoneIncoming,
  PhoneOutgoing,
  MailCheck,
  Radio,
  Phone,
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import IntegrationLogos from "./layout/IntegrationLogos";
import WirelineMark from "./WirelineMark";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent as AgentCard,
} from "../data/contact-agents";

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

/**
 * Sign-in / sign-up shortcut row. Most business users have a Google
 * or Microsoft identity already; skipping the email-and-password
 * dance for them is a meaningful conversion lift. Buttons start the
 * server-side OAuth flow which round-trips back to /auth/oauth-complete.
 */
function OAuthSignInButtons({ disabled }: { disabled?: boolean }) {
  const [pending, setPending] = useState<"google" | "microsoft" | "yahoo" | null>(null);
  const start = async (provider: "google" | "microsoft" | "yahoo") => {
    if (disabled || pending) return;
    setPending(provider);
    try {
      const res = await fetch(`/api/auth/${provider}/url`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Could not start ${provider} sign-in`);
      }
      const { url } = (await res.json()) as { url: string };
      window.location.assign(url);
    } catch {
      setPending(null);
    }
  };
  return (
    <div className="relative z-10 space-y-3 mb-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => start("google")}
          disabled={disabled || !!pending}
          aria-label="Continue with Google"
          className="h-11 inline-flex items-center justify-center gap-2.5 rounded-xl border border-black/12 bg-white text-ink text-[12px] font-medium hover:border-[#4F1E7B]/40 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {pending === "google" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
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
          )}
          <span>Continue with Google</span>
        </button>
        <button
          type="button"
          onClick={() => start("microsoft")}
          disabled={disabled || !!pending}
          aria-label="Continue with Microsoft"
          className="h-11 inline-flex items-center justify-center gap-2.5 rounded-xl border border-black/12 bg-white text-ink text-[12px] font-medium hover:border-[#4F1E7B]/40 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {pending === "microsoft" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#F25022" d="M1 1h10v10H1z" />
              <path fill="#7FBA00" d="M13 1h10v10H13z" />
              <path fill="#00A4EF" d="M1 13h10v10H1z" />
              <path fill="#FFB900" d="M13 13h10v10H13z" />
            </svg>
          )}
          <span>Continue with Microsoft</span>
        </button>
        <button
          type="button"
          onClick={() => start("yahoo")}
          disabled={disabled || !!pending}
          aria-label="Continue with Yahoo"
          className="h-11 inline-flex items-center justify-center gap-2.5 rounded-xl border border-black/12 bg-white text-ink text-[12px] font-medium hover:border-[#4F1E7B]/40 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {pending === "yahoo" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#6001D2" d="M3 6h4.6l3 6 3-6h4.6l-5.9 11.3V21H9.9v-3.7L3 6z" />
              <circle cx="20" cy="13" r="2" fill="#6001D2" />
            </svg>
          )}
          <span>Continue with Yahoo</span>
        </button>
      </div>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="flex-1 h-px bg-black/8" />
        <span className="text-[9px] uppercase tracking-[0.4em] text-muted/60 font-medium">
          or with email
        </span>
        <span className="flex-1 h-px bg-black/8" />
      </div>
    </div>
  );
}

function AgentCardLink({ agent, isDemo }: { agent: AgentCard; isDemo?: boolean }) {
  return (
    <a
      href={`tel:${agent.tel}`}
      className="group relative block rounded-xl p-3 overflow-hidden border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all duration-200 glass"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/10"
          style={{ background: isDemo ? "rgba(255,255,255,0.03)" : `${agent.tint}1a` }}
        >
          <Phone
            className="w-3.5 h-3.5"
            style={{ color: isDemo ? "#a1a1aa" : agent.tint }}
            strokeWidth={2.4}
          />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted/70 leading-none mb-1 truncate">
            {isDemo ? "DEMO" : "LIVE"} · {agent.name}
          </p>
          <p className="font-display italic text-sm leading-snug text-ink/90 group-hover:text-ink transition-colors line-clamp-2 text-balance">
            {agent.role}
          </p>
        </div>
        <div className="shrink-0 flex items-center self-center justify-center w-6 h-6 rounded-full border border-white/5 group-hover:bg-white/10 transition-colors">
          <ArrowRight className="w-3 h-3 text-ink/40 group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </a>
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
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isSignUp = mode === "signup";
  const isReset = mode === "reset";
  const pwStrength = isSignUp ? getPasswordStrength(password) : null;

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
    if (isSignUp && password.length < 8) {
      setError("Password must be at least 8 characters.");
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Password reset request failed");
        setMessage(data.message || "If that email is registered, a reset link is on its way.");
      } else {
        const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/signin";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Authentication failed");

        signIn({
          access_token: data.token,
          user: data.user,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta
        title={isReset ? "Reset Password" : isSignUp ? "Create Account" : "Sign In"}
        description={
          isSignUp
            ? "Start your 14-day free Wireline trial — deploy an AI voice agent in under 10 minutes. No credit card required."
            : "Sign in to your Wireline operator console to manage your AI voice agents, call logs, and outbound campaigns."
        }
      />
      <div className="h-screen flex relative overflow-hidden bg-[#FAF9F5]">
        {/* Global parchment backdrop matching Claude.ai */}
        <div className="pointer-events-none fixed inset-0 z-0 bg-[#FAF9F5]" />
        <div className="scanline" />

        {/* ── LEFT PANEL — brand showcase ───────────────────────────────────────
           h-screen + overflow-y-auto so the agent showcase + integration
           strip don't push the whole layout taller than the viewport.
           Without this, the left column at lg+ widths grows to ~1020px,
           making the Sign In button on the right scroll-required even
           though it's anchored to the top of its column. */}
        <div className="hidden lg:flex lg:w-[54%] xl:w-[56%] flex-col relative z-10 p-6 xl:p-8 h-screen overflow-y-auto scrollbar-hide">
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
            className="flex items-center gap-3 mb-8"
          >
            <div
              className="relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "#4F1E7B",
                boxShadow:
                  "0 8px 24px -8px rgba(79,30,123,0.4), 0 0 0 1px rgba(255,255,255,0.22) inset",
              }}
            >
              <WirelineMark className="w-4 h-4 text-on-brand" strokeWidth={130} />
            </div>
            <div>
              <span className="brand-wordmark text-xl leading-none !text-[#4F1E7B] !filter-none">
                WIRELINE
              </span>
              <p className="text-[7px] tracking-[0.42em] uppercase text-muted mt-0.5">
                AI Voice Platform
              </p>
            </div>
          </motion.div>

          {/* Hero copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
              <span className="text-[8px] uppercase tracking-[0.5em] text-muted/70">
                One fleet, every channel
              </span>
            </div>
            <h2 className="font-display italic text-4xl xl:text-5xl leading-[1.0] xl:leading-[0.92] tracking-tight mb-4 text-balance">
              <span className="text-[#4F1E7B]">AI agents for every</span>
              <br />
              <span className="text-ink">customer conversation</span>
            </h2>
            <p className="text-[13px] text-muted/80 leading-relaxed max-w-md mb-5">
              Wireline runs your <span className="text-ink/90">inbound support</span>,{" "}
              <span className="text-ink/90">outbound sales</span>, and{" "}
              <span className="text-ink/90">email follow-ups</span> across one fleet of AI agents —
              trained on your playbook, available 24/7, improving with every interaction.
            </p>
            <div className="flex items-center gap-5">
              <div className="flex flex-col">
                <span className="font-display italic text-2xl text-ink">10M+</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                  Calls Handled
                </span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex flex-col">
                <span className="font-display italic text-2xl text-ink">$150M+</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                  Pipeline Gen
                </span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex flex-col">
                <span className="font-display italic text-2xl text-ink">4.9/5</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                  Avg CSAT
                </span>
              </div>
            </div>
          </motion.div>

          {/* All 10 demo agents in a single dense grid. Top 4 are the LIVE
            Wireline customer-service team (sales, support, tech, demo
            booking). Bottom 6 are vertical role-play demos (medical
            intake, real-estate front desk, bill negotiator, etc.) that
            answer Wireline questions too. Two labelled sub-sections so
            visitors can tell which line will actually reach our team
            vs. which line is a "watch the platform work" demo. */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 flex-1"
          >
            <a
              href="tel:+16305811834"
              className="flex items-center justify-between mb-4 bg-[#4F1E7B]/10 border border-[#4F1E7B]/30 rounded-xl p-3 hover:bg-[#4F1E7B]/20 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#4F1E7B] flex items-center justify-center shadow-[0_0_15px_rgba(79,30,123,0.3)]">
                  <Phone className="w-4 h-4 text-on-brand" fill="currentColor" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#4F1E7B] font-medium leading-tight">
                    Call our demo line now
                  </p>
                  <p className="font-display italic text-xl text-ink leading-tight mt-0.5">
                    (630) 581-1834
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#4F1E7B] group-hover:translate-x-1 transition-transform" />
            </a>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] uppercase tracking-[0.4em] text-[#4F1E7B] font-medium">
                Wireline Team
              </span>
              <span className="flex-1 h-px bg-[#4F1E7B]/20" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {WIRELINE_CONTACT_AGENTS.map((a) => (
                <AgentCardLink key={a.tel} agent={a} isDemo={false} />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] uppercase tracking-[0.4em] text-muted/60">
                Vertical Role-Plays
              </span>
              <span className="flex-1 h-px bg-white/10" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {WIRELINE_DEMO_AGENTS.map((a) => (
                <AgentCardLink key={a.tel} agent={a} isDemo={true} />
              ))}
            </div>
          </motion.div>

          {/* Integration logo strip — trust signal showing the stack we run on */}
          <IntegrationLogos />

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
              <span className="text-[9px] uppercase tracking-[0.38em]">99.9% Uptime</span>
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
        <div className="flex-1 flex flex-col items-center relative z-10 py-4 px-6 md:py-6 md:px-10 overflow-y-auto">
          <div className="lg:hidden w-full max-w-md mb-6 pt-4">
            {/* Logo + wordmark row */}
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "#4F1E7B",
                  boxShadow: "0 8px 24px -8px rgba(79,30,123,0.4)",
                }}
              >
                <WirelineMark className="w-5 h-5 text-on-brand" strokeWidth={130} />
              </div>
              <div>
                <span className="brand-wordmark text-2xl leading-none !text-[#4F1E7B] !filter-none">
                  WIRELINE
                </span>
                <p className="text-[8px] tracking-[0.42em] uppercase text-muted mt-0.5">
                  AI Voice Platform
                </p>
              </div>
            </div>
            {/* Hero copy */}
            <h2 className="font-display italic text-2xl sm:text-3xl leading-snug tracking-tight mb-3 text-balance">
              <span className="text-[#4F1E7B]">AI agents for every</span>{" "}
              <span className="text-ink">customer conversation</span>
            </h2>
            <p className="text-[12px] text-muted/80 leading-relaxed mb-5">
              Tap any number below to hear a Wireline agent live — no signup needed.
            </p>

            {/* Primary CTA — call Wireline directly. Different from the
              4 demos: this one reaches our actual customer-service team
              (any of the 6 unified CS lines; Sarah is the first). */}
            <a
              href={`tel:${WIRELINE_CONTACT_AGENTS[0].tel}`}
              className="flex items-center justify-between mb-3 bg-[#4F1E7B]/8 border border-[#4F1E7B]/30 rounded-xl p-3 hover:bg-[#4F1E7B]/14 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#4F1E7B] flex items-center justify-center shadow-[0_0_15px_rgba(79,30,123,0.35)] shrink-0">
                  <Phone className="w-4 h-4 text-on-brand" fill="currentColor" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.28em] text-[#4F1E7B] font-medium leading-tight">
                    Talk to Wireline
                  </p>
                  <p className="font-display italic text-lg text-ink leading-tight mt-0.5 truncate">
                    {WIRELINE_CONTACT_AGENTS[0].display}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#4F1E7B] shrink-0 group-hover:translate-x-1 transition-transform" />
            </a>

            {/* Section label */}
            <div className="flex items-center gap-2 mt-4 mb-2">
              <span className="text-[9px] uppercase tracking-[0.4em] text-muted/70 font-medium">
                Live demo agents · {WIRELINE_DEMO_AGENTS.length} roles
              </span>
              <span className="flex-1 h-px bg-[#4F1E7B]/15" />
            </div>

            {/* All 4 demo agents — 2-col grid stays readable down to 320px */}
            <div className="grid grid-cols-2 gap-2">
              {WIRELINE_DEMO_AGENTS.map((a) => (
                <AgentCardLink key={a.tel} agent={a} isDemo />
              ))}
            </div>

            {/* Subtle divider */}
            <div
              className="mt-6 h-px w-full"
              style={{
                background:
                  "linear-gradient(to right, transparent, rgba(79,30,123,0.25), rgba(79,30,123,0.25), transparent)",
              }}
            />
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
            <p className="text-[9px] uppercase tracking-[0.5em] text-muted">AI Voice Platform</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            {/* Form card */}
            <div className="relative rounded-3xl border border-black/8 bg-[#FAF8F5] shadow-lg overflow-hidden">
              <div className="relative p-6 md:p-8">
                {/* Header */}
                <div className="relative z-10 mb-8">
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
                {!isReset && <OAuthSignInButtons disabled={loading} />}

                <form onSubmit={handleAuth} className="relative z-10 space-y-4">
                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-[#4F1E7B]" />
                      Email
                    </label>
                    <div className="relative group">
                      <input
                        type="email"
                        required
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
                        <label className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5">
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
                          type="password"
                          required
                          minLength={isSignUp ? 8 : undefined}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="auth-input tracking-[0.32em]"
                          placeholder="••••••••••••"
                        />
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

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-4 px-6 text-[12px] tracking-[0.3em] uppercase font-medium rounded-full cursor-pointer text-on-brand bg-[#4F1E7B] hover:bg-[#6A25A3] active:translate-y-0 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
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

            {/* Feature pillars — moved here from the left brand panel so they
              fill the white space under the sign-in card and reinforce
              value-props at the moment of conversion (the user is right
              next to the Sign In button when they read these). */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.2 + i * 0.08,
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="relative rounded-xl p-3 border border-black/5 bg-[#FAF8F5] overflow-hidden"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2 border border-black/5 bg-[#4F1E7B]/10 text-[#4F1E7B]">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[11px] font-medium text-ink mb-0.5 leading-tight">
                      {f.title}
                    </p>
                    <p className="text-[10px] text-muted/70 leading-snug">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-center gap-4">
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
