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
import IntegrationLogos from "./layout/IntegrationLogos";
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
    accent: "#0AC8D4",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound Sales",
    desc: "Upload a CSV, pick a playbook, launch auto-dial campaigns. Qualified meetings on your calendar by morning.",
    accent: "#9B59F5",
  },
  {
    icon: MailCheck,
    title: "Email Agents",
    desc: "Agents triage your inbox, reply on-brand, follow up, and escalate the ones you need to see personally.",
    accent: "#E040C0",
  },
  {
    icon: Radio,
    title: "Live Monitor & Insights",
    desc: "Watch every conversation in real time. Sentiment, funnels, topic clusters, leaderboards — one dashboard.",
    accent: "#10B981",
  },
];

function AgentCardLink({ agent }: { agent: AgentCard }) {
  return (
    <a
      href={`tel:${agent.tel}`}
      className="group relative block rounded-2xl p-4 overflow-hidden border border-white/12 hover:border-white/28 hover:scale-[1.015] transition-all duration-200"
      style={{
        background: `linear-gradient(135deg, ${agent.tint}2c, ${agent.tint}12)`,
        boxShadow: `0 10px 28px -14px ${agent.tint}88`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${agent.tint}, ${agent.tint}cc)`,
            boxShadow: `0 6px 14px -4px ${agent.tint}aa`,
          }}
        >
          <Phone className="w-4 h-4 text-paper" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted/80 leading-none mb-1.5 truncate">
            {agent.name} · {agent.role}
          </p>
          <p className="font-display italic text-lg leading-none text-ink truncate">
            {agent.display}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-ink/40 group-hover:text-ink group-hover:translate-x-1 transition-all shrink-0" />
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
    4: { label: "Strong", color: "#0AC8D4" },
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
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Password reset request failed");
        setMessage(data.message || "If that email is registered, a reset link is on its way.");
      } else {
        const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/signin";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
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
    <div className="h-screen flex relative overflow-hidden">
      {/* Global aurora backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[25%] -left-[15%] w-[70vw] h-[70vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(10,200,212,0.22), transparent 60%)" }}
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[20%] -right-[15%] w-[65vw] h-[65vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,107,217,0.22), transparent 60%)" }}
          animate={{ x: [0, -35, 0], y: [0, 30, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[35%] left-[30%] w-[50vw] h-[50vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(197,139,255,0.18), transparent 60%)" }}
          animate={{ x: [0, -40, 20, 0], y: [0, 35, -15, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>
      <div className="scanline" />

      {/* ── LEFT PANEL — brand showcase ───────────────────────────────────────
           h-screen + overflow-y-auto so the agent showcase + integration
           strip don't push the whole layout taller than the viewport.
           Without this, the left column at lg+ widths grows to ~1020px,
           making the Sign In button on the right scroll-required even
           though it's anchored to the top of its column. */}
      <div className="hidden lg:flex lg:w-[54%] xl:w-[56%] flex-col relative z-10 p-6 xl:p-10 h-screen overflow-y-auto scrollbar-hide">
        {/* Decorative vertical line on right edge */}
        <div
          className="absolute top-0 right-0 w-px h-full"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(10,200,212,0.35) 30%, rgba(197,139,255,0.35) 70%, transparent)",
          }}
        />

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 mb-16"
        >
          <div
            className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
              boxShadow:
                "0 8px 24px -8px rgba(10,200,212,0.60), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <Waves className="w-5 h-5 text-paper" strokeWidth={2.5} />
          </div>
          <div>
            <span className="brand-wordmark text-2xl leading-none">WIRELINE</span>
            <p className="text-[8px] tracking-[0.42em] uppercase text-muted mt-0.5">
              AI Voice Platform
            </p>
          </div>
        </motion.div>

        {/* Hero copy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="hero-accent-line" />
            <span className="text-[9px] uppercase tracking-[0.5em] text-muted/70">
              One fleet, every channel
            </span>
          </div>
          <h2 className="font-display italic text-5xl xl:text-6xl leading-[0.88] tracking-tight mb-6">
            <span className="text-aurora">AI agents for every</span>
            <br />
            <span className="text-ink">customer conversation</span>
          </h2>
          <p className="text-sm text-muted/80 leading-relaxed max-w-md">
            Wireline runs your <span className="text-ink/90">inbound support</span>,{" "}
            <span className="text-ink/90">outbound sales</span>, and{" "}
            <span className="text-ink/90">email follow-ups</span> across one fleet of AI agents —
            trained on your playbook, available 24/7, improving with every interaction.
          </p>
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
          className="mb-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] uppercase tracking-[0.4em] text-brand/90">
              Talk to Wireline · 6 live customer-service lines
            </span>
            <span className="flex-1 h-px bg-brand/30" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WIRELINE_CONTACT_AGENTS.map((a) => (
              <AgentCardLink key={a.tel} agent={a} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 mb-2">
            <span className="text-[9px] uppercase tracking-[0.4em] text-muted/70">
              See us in action · 4 vertical demo agents
            </span>
            <span className="flex-1 h-px bg-white/10" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WIRELINE_DEMO_AGENTS.map((a) => (
              <AgentCardLink key={a.tel} agent={a} />
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
        {/* ── Mobile marketing hero — lg:hidden so it only renders below the desktop breakpoint ── */}
        <div className="lg:hidden w-full max-w-md mb-6 pt-4">
          {/* Logo + wordmark row */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
                boxShadow: "0 8px 24px -8px rgba(10,200,212,0.60)",
              }}
            >
              <Waves className="w-5 h-5 text-paper" strokeWidth={2.5} />
            </div>
            <div>
              <span className="brand-wordmark text-2xl leading-none">WIRELINE</span>
              <p className="text-[8px] tracking-[0.42em] uppercase text-muted mt-0.5">AI Voice Platform</p>
            </div>
          </div>
          {/* Hero copy */}
          <h2 className="font-display italic text-3xl leading-tight tracking-tight mb-3">
            <span className="text-aurora">AI agents for every</span>
            <br />
            <span className="text-ink">customer conversation</span>
          </h2>
          <p className="text-[12px] text-muted/80 leading-relaxed mb-5">
            Wireline runs your inbound support, outbound sales, and email follow-ups across
            one fleet of AI agents — trained on your playbook, available 24/7.
          </p>
          {/* Feature pill badges */}
          <div className="flex flex-wrap gap-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border text-[10px] text-ink/80"
                  style={{ borderColor: `${f.accent}35` }}
                >
                  <Icon className="w-3 h-3 shrink-0" style={{ color: f.accent }} />
                  {f.title}
                </div>
              );
            })}
          </div>
          {/* Subtle divider */}
          <div
            className="mt-6 h-px w-full"
            style={{ background: "linear-gradient(to right, transparent, rgba(10,200,212,0.3), rgba(197,139,255,0.3), transparent)" }}
          />
        </div>

        {/* Mobile logo — retained for the form-card width reference, hidden visually below hero */}
        <div className="hidden">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
              boxShadow: "0 16px 40px -10px rgba(10,200,212,0.55)",
            }}
          >
            <Waves className="w-8 h-8 text-paper" strokeWidth={2.2} />
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
          <div className="relative aurora-ring rounded-3xl">
            <div className="relative rounded-3xl p-6 md:p-8 glass-strong overflow-hidden">
              {/* Subtle ambient glows inside card */}
              <div
                className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-20 blur-3xl pointer-events-none"
                style={{ background: "radial-gradient(circle, #0AC8D4, transparent)" }}
              />
              <div
                className="absolute -bottom-24 -left-24 w-56 h-56 rounded-full opacity-20 blur-3xl pointer-events-none"
                style={{ background: "radial-gradient(circle, #E040C0, transparent)" }}
              />

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
                  <div className="relative flex p-1 rounded-2xl bg-black/8 border border-black/10">
                    <motion.div
                      layout
                      className="absolute inset-y-1 w-[calc(50%-4px)] rounded-xl"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(10,200,212,0.20), rgba(197,139,255,0.20))",
                        border: "1px solid rgba(10,200,212,0.35)",
                        left: isSignUp ? "calc(50% + 2px)" : "4px",
                        boxShadow: "0 6px 20px -8px rgba(10,200,212,0.5)",
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

              <form onSubmit={handleAuth} className="relative z-10 space-y-4">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-brand" />
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
                        boxShadow: "0 0 0 1px rgba(10,200,212,0.4), 0 0 20px rgba(10,200,212,0.18)",
                      }}
                    />
                  </div>
                </div>

                {/* Password — hidden in reset mode */}
                {!isReset && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-brand" />
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
                          className="text-[9px] uppercase tracking-[0.3em] text-muted/60 hover:text-brand transition-colors"
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
                            "0 0 0 1px rgba(10,200,212,0.4), 0 0 20px rgba(10,200,212,0.18)",
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
                                  i <= pwStrength.score
                                    ? pwStrength.color
                                    : "rgba(255,255,255,0.08)",
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
                    className="text-[10px] uppercase tracking-[0.3em] text-muted/60 hover:text-brand transition-colors"
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
                  className="brutal-btn w-full !py-4 !px-6 !text-[12px] !tracking-[0.3em]"
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
                  className="relative rounded-xl p-3 glass border border-white/8 overflow-hidden"
                >
                  <div
                    className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-20 pointer-events-none"
                    style={{ background: f.accent }}
                  />
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center mb-2 border border-white/8"
                    style={{
                      background: `linear-gradient(135deg, ${f.accent}25, ${f.accent}08)`,
                      color: f.accent,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[11px] font-medium text-ink mb-0.5 leading-tight">{f.title}</p>
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
  );
}
