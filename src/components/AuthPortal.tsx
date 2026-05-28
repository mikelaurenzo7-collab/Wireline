/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  UserPlus,
  LogIn,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import RoiCalculator from "./marketing/RoiCalculator";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "./WirelineMark";
import {
  captureSignupIntentFromLocation,
  syncSignupIntent,
  type SignupIntent,
} from "../lib/signup-intent";
import { getPasswordPolicyError } from "../lib/password-policy";

function extractServerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [p.error, p.message, (p.error as any)?.message];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
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
      <div className="grid grid-cols-3 gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => start(p.id)}
            disabled={disabled || !!pending}
            aria-label={`Continue with ${p.label}`}
            title={`Continue with ${p.label}`}
            className="min-h-[52px] py-2.5 inline-flex flex-col items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white/70 text-ink text-[11px] uppercase tracking-[0.16em] font-medium hover:border-[#4F1E7B]/40 hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {pending === p.id ? <Loader2 className="w-5 h-5 animate-spin" /> : p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="flex-1 h-px bg-black/8" />
        <span className="text-[11px] uppercase tracking-[0.3em] text-ink/40 font-medium">
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
        title={isReset ? "Reset Password" : isSignUp ? "Create Account" : "Sign In"}
        description={
          isSignUp
            ? "Start your 14-day free Wireline trial — deploy an AI voice agent in under 10 minutes. No credit card required."
            : "Sign in to your Wireline operator console to manage your AI voice agents, call logs, and outbound campaigns."
        }
        path={pathname === "/signup" ? "/signup" : undefined}
        noIndex={true}
      />
      <div className="min-h-dvh flex flex-col items-center justify-center relative overflow-hidden bg-paper px-4 py-6 sm:py-8">
        <div className="pointer-events-none fixed inset-0 z-0 bg-paper" />
        <div className="scanline" />

        {/* Aurora wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden -z-10"
        >
          <div
            className="absolute -top-20 -right-24 w-[420px] h-[420px] rounded-full opacity-[0.45] mix-blend-multiply animate-[wireline-aurora-a_14s_ease-in-out_infinite_alternate]"
            style={{
              background:
                "radial-gradient(closest-side, rgba(79,30,123,0.18), rgba(79,30,123,0.04) 55%, transparent 80%)",
              filter: "blur(28px)",
            }}
          />
          <div
            className="absolute -bottom-32 -left-24 w-[480px] h-[480px] rounded-full opacity-40 mix-blend-multiply animate-[wireline-aurora-b_19s_ease-in-out_infinite_alternate]"
            style={{
              background:
                "radial-gradient(closest-side, rgba(217,119,82,0.14), rgba(217,119,82,0.03) 55%, transparent 80%)",
              filter: "blur(32px)",
            }}
          />
        </div>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 mb-6"
        >
          <Link to="/" className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "#4F1E7B",
                boxShadow: "0 8px 24px -8px rgba(79,30,123,0.4)",
              }}
            >
              <WirelineMark className="w-5.5 h-5.5 text-on-brand" strokeWidth={130} />
            </div>
            <div>
              <span className="brand-wordmark text-2xl leading-none !text-[#4F1E7B] !filter-none">
                WIRELINE
              </span>
              <p className="text-[11px] tracking-[0.3em] uppercase text-ink/50 mt-0.5">
                AI Voice + Email Platform
              </p>
            </div>
          </Link>
        </motion.div>

        {/* Auth card */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-[420px]"
        >
          <div
            className="relative rounded-2xl border border-black/8 bg-[#FAF8F5] overflow-hidden"
            style={{
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.9) inset, 0 20px 50px -24px rgba(79,30,123,0.18), 0 8px 24px -12px rgba(0,0,0,0.10)",
            }}
          >
            <div className="relative p-6 sm:p-8">
              {/* Header */}
              <div className="relative z-10 mb-6">
                <h1 className="font-display italic text-3xl text-ink leading-tight mb-1">
                  {isReset ? "Reset password" : isSignUp ? "Create account" : "Welcome back"}
                </h1>
                <p className="text-[13px] text-ink/60">
                  {isReset
                    ? "Enter your email and we'll send you a reset link."
                    : isSignUp
                      ? "Start your 14-day free trial. No credit card required."
                      : "Sign in to your Wireline operator console."}
                </p>
                {isSignUp && intentLabel && (
                  <p className="mt-2 inline-flex rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-brand">
                    Matched from your visit · {intentLabel}
                  </p>
                )}
              </div>

              {/* Tab toggle */}
              {!isReset && (
                <div className="relative z-10 mb-5">
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
                        className={
                          "relative z-10 flex-1 py-2.5 text-[11px] uppercase tracking-[0.25em] transition-colors font-medium " +
                          (isSignUp === opt.value ? "text-ink" : "text-ink/45 hover:text-ink/65")
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* OAuth */}
              {!isReset && (
                <OAuthSignInButtons disabled={loading} onError={(m) => setError(m || null)} />
              )}

              <form onSubmit={handleAuth} className="relative z-10 space-y-3.5">
                {/* Email */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className="text-[11px] uppercase tracking-[0.3em] text-ink/55 flex items-center gap-1.5 font-medium"
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
                        boxShadow: "0 0 0 1px rgba(79,30,123,0.45), 0 0 20px rgba(79,30,123,0.12)",
                      }}
                    />
                  </div>
                </div>

                {/* Password */}
                {!isReset && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="auth-password"
                        className="text-[11px] uppercase tracking-[0.3em] text-ink/55 flex items-center gap-1.5 font-medium"
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
                          className="text-[11px] uppercase tracking-[0.2em] text-ink/40 hover:text-[#4F1E7B] transition-colors"
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors"
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
                            "0 0 0 1px rgba(79,30,123,0.45), 0 0 20px rgba(79,30,123,0.12)",
                        }}
                      />
                    </div>
                    {isSignUp && password.length > 0 && pwStrength && (
                      <div className="space-y-1">
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
                          className="text-[11px] uppercase tracking-[0.2em]"
                          style={{ color: pwStrength.color }}
                        >
                          {pwStrength.label}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {isReset && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setMessage(null);
                    }}
                    className="text-[11px] uppercase tracking-[0.2em] text-ink/40 hover:text-[#4F1E7B] transition-colors"
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
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-[13px]"
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
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-[13px]"
                    >
                      <Check className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{message}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Terms */}
                {isSignUp && (
                  <label className="flex items-start gap-2 text-[12px] text-ink/55 leading-snug cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 accent-[#4F1E7B]"
                      required
                    />
                    <span>
                      I agree to the{" "}
                      <Link to="/terms" className="underline hover:text-ink">
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link to="/privacy" className="underline hover:text-ink">
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
                  className="native-tap-squish w-full flex items-center justify-center gap-2 py-3.5 px-6 text-[12px] tracking-[0.25em] uppercase font-medium rounded-full cursor-pointer text-on-brand bg-[#4F1E7B] hover:bg-[#6A25A3] max-md:hover:translate-y-0 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                  style={{ boxShadow: "0 4px 12px -2px rgba(79,30,123,0.3)" }}
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

          {/* ROI Calculator - compact, below the auth card */}
          <RoiCalculator compact />

          {/* Footer */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <ShieldCheck className="w-3 h-3 text-ink/30" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-ink/40">
              TLS Encrypted · Secured Infrastructure
            </span>
          </div>
        </motion.div>
      </div>
    </>
  );
}
