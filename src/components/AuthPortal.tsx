/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  UserPlus,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";
import PublicSiteHeader from "./marketing/PublicSiteHeader";
import WirelineMark from "./WirelineMark";
import { cn } from "../lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import {
  captureSignupIntentFromLocation,
  sanitizeSignupIntent,
  syncSignupIntent,
  type SignupIntent,
} from "../lib/signup-intent";
import { getPasswordPolicyError } from "../lib/password-policy";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";
import { Label } from "./ui/shadcn/Label";
import { Alert, AlertDescription } from "./ui/shadcn/Alert";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { BRAND } from "../constants/brand-colors";
import { markFreshSignupSession } from "../lib/post-signup-onboarding";
import {
  captureDemoSourceFromLocation,
  readDemoSourceCookie,
} from "../lib/demo-attribution-client";

function extractServerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [p.error, p.message, (p.error as any)?.message];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const details = p.details;
  if (Array.isArray(details) && details.length > 0) {
    const parts = details
      .map((d) => {
        if (!d || typeof d !== "object") return null;
        const row = d as { field?: unknown; message?: unknown };
        const msg = typeof row.message === "string" ? row.message.trim() : "";
        if (!msg) return null;
        const field = typeof row.field === "string" && row.field ? row.field : null;
        return field ? `${field}: ${msg}` : msg;
      })
      .filter((s): s is string => !!s);
    if (parts.length > 0) return parts.slice(0, 3).join(" ");
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
    <div className="space-y-4 mb-6">
      <div className="flex gap-4">
        {providers.map((p) => (
          <ShadButton
            key={p.id}
            type="button"
            variant="outline"
            disableAnimations
            onClick={() => start(p.id)}
            disabled={disabled || !!pending}
            aria-label={`Continue with ${p.label}`}
            className="flex-1 h-10 bg-transparent border border-white/10 hover:border-primary/50 hover:bg-white/5 text-muted-foreground hover:text-foreground font-sans transition-all flex justify-center items-center gap-2 rounded-none group focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {pending === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : p.icon}
            <span className="hidden sm:inline">{p.label}</span>
          </ShadButton>
        ))}
      </div>
      <div className="relative flex items-center justify-center pt-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10"></div>
        </div>
        <span className="relative px-3 bg-velvet font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Operator Authorization</span>
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
    0: { label: "Too short", color: BRAND.rose },
    1: { label: "Weak", color: BRAND.rose },
    2: { label: "Fair", color: BRAND.purpleMuted },
    3: { label: "Good", color: BRAND.purple },
    4: { label: "Strong", color: BRAND.purple },
  };
  return { score: clamped, ...meta[clamped] };
}

type AuthMode = "signin" | "signup" | "reset";

/** Slim sign-in / sign-up surface — marketing lives on `/` (LandingPage). */
export default function AuthPortal() {
  const { signIn } = useAuth();
  const pathname = typeof window === "undefined" ? "/signin" : window.location.pathname;
  const initialMode: AuthMode = pathname === "/signup" ? "signup" : "signin";
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setSignupIntent(captureSignupIntentFromLocation());
    captureDemoSourceFromLocation();
  }, []);

  useEffect(() => {
    if (pathname === "/signup") setMode("signup");
    else setMode((m) => (m === "reset" ? "reset" : "signin"));
  }, [pathname]);

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
          throw new Error(
            serverMsg ||
              (res.status >= 500
                ? "Server temporarily unavailable. Please try again shortly."
                : "Password reset request failed"),
          );
        }
        setMessage(data.message || "If that email is registered, a reset link is on its way.");
      } else {
        const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/signin";
        const attribution = isSignUp ? sanitizeSignupIntent(signupIntent) : null;
        const demoSource = isSignUp ? readDemoSourceCookie() : null;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
            ...(attribution
              ? {
                  preferredPlanId: attribution.preferredPlanId,
                  signupWedge: attribution.signupWedge,
                  utmSource: attribution.utmSource,
                  utmMedium: attribution.utmMedium,
                  utmCampaign: attribution.utmCampaign,
                }
              : {}),
            ...(demoSource ? { demoSource } : {}),
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
          throw new Error(
            serverMsg ||
              (res.status >= 500
                ? "Server temporarily unavailable. Please try again shortly."
                : "Authentication failed"),
          );
        }

        await syncSignupIntent(signupIntent).catch(() => {});
        if (!data.user?.id) {
          throw new Error("Authentication succeeded but user payload was missing.");
        }
        if (isSignUp) markFreshSignupSession();
        signIn({ user: data.user });
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
        title={isSignUp ? "Identity · Session Verification — Wireline" : "Identity · Session Verification — Wireline"}
        description={
          isSignUp
            ? "Start your 14-day free Wireline trial — deploy an AI voice agent in under 10 minutes."
            : "Sign in to your Wireline operator console."
        }
        path={isSignUp ? "/signup" : "/signin"}
        noIndex
      />
      <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden dark">
        {/* Background Brand Halo (Stealth Signal Focus) */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[100px] pointer-events-none opacity-60 mix-blend-screen"></div>
        {/* Decorative Grid Background (Micro-detail) */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "linear-gradient(#f3e8ff 1px, transparent 1px), linear-gradient(90deg, #f3e8ff 1px, transparent 1px)", backgroundSize: "40px 40px" }}></div>

        <PublicSiteHeader
          active={isSignUp ? "signup" : "signin"}
        />

        <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-20 pb-32">
          <main className="w-full max-w-[420px] relative">
            <div className="mb-10 text-center">
              <h1 className="font-display text-4xl text-primary tracking-tight mb-2">WIRELINE</h1>
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
                {isReset
                    ? "Authorization Recovery"
                    : isSignUp
                    ? "Secure Session Registration"
                    : "Secure Session Verification"}
              </p>
              {isSignUp && intentLabel && (
                <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-primary/80 bg-primary/10 py-1 px-3 border border-primary/20 inline-block">
                  INTENT: {intentLabel}
                </p>
              )}
            </div>

            <div className="relative bg-velvet border border-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_40px_rgba(0,0,0,0.5)] p-8 flex flex-col gap-6 backdrop-blur-xl">
              
              {!isReset && (
                <div className="flex bg-card/50 border border-white/5 p-1 mb-2 relative">
                  <motion.div
                    layout
                    className={cn(
                      "absolute inset-y-1 w-[calc(50%-4px)] bg-primary/20 border border-primary/30",
                      isSignUp ? "left-[calc(50%+2px)]" : "left-1",
                    )}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                  {[
                    { label: "Verify", value: false },
                    { label: "Register", value: true },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => {
                        setIsSignUp(opt.value);
                        setError(null);
                        setMessage(null);
                      }}
                      className={cn(
                        "relative z-10 flex-1 py-2 text-xs font-mono uppercase tracking-widest transition-colors",
                        isSignUp === opt.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {!isReset && (
                <OAuthSignInButtons disabled={loading} onError={(m) => setError(m || null)} />
              )}

              <form onSubmit={handleAuth} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2 relative group">
                  <label className="font-mono text-[10px] text-muted-foreground uppercase transition-colors group-focus-within:text-primary" htmlFor="auth-email">
                    Operator ID (Email)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 group-focus-within:text-primary transition-colors" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-[40px] bg-card/50 border border-white/5 text-foreground font-sans pl-10 pr-3 rounded-none focus:outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(139,63,214,0.12)] transition-all placeholder:text-muted-foreground/50"
                      placeholder="SYS-OP-ALPHA"
                    />
                  </div>
                </div>

                {!isReset && (
                  <div className="flex flex-col gap-2 relative group">
                    <div className="flex justify-between items-center">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase transition-colors group-focus-within:text-primary" htmlFor="auth-password">
                        Authorization Key
                      </label>
                      {!isSignUp && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode("reset");
                            setError(null);
                          }}
                          className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase"
                        >
                          Recover?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 group-focus-within:text-primary transition-colors" />
                      <input
                        id="auth-password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={isSignUp ? 8 : undefined}
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-[40px] bg-card/50 border border-white/5 text-foreground font-sans pl-10 pr-10 rounded-none focus:outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(139,63,214,0.12)] transition-all placeholder:text-muted-foreground/50"
                        placeholder="••••••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground w-6 h-6 flex items-center justify-center transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {isSignUp && password.length > 0 && pwStrength && (
                      <div className="mt-2">
                        <div className="flex h-1 gap-1 w-full opacity-60">
                          {[1, 2, 3, 4].map((level) => (
                            <div key={level} className={cn("flex-1 h-full", level <= pwStrength.score ? "bg-primary" : "bg-white/10")} />
                          ))}
                        </div>
                        <p className="font-mono text-[10px] uppercase text-primary mt-2">{pwStrength.label}</p>
                      </div>
                    )}
                    {isSignUp && (
                      <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground uppercase opacity-70">
                        <li className={password.length >= 8 ? "text-primary opacity-100" : ""}>{password.length >= 8 ? "✓" : "•"} 8+ chars</li>
                        <li className={/[A-Z]/.test(password) ? "text-primary opacity-100" : ""}>{/[A-Z]/.test(password) ? "✓" : "•"} Uppercase</li>
                        <li className={/[a-z]/.test(password) ? "text-primary opacity-100" : ""}>{/[a-z]/.test(password) ? "✓" : "•"} Lowercase</li>
                        <li className={/[0-9]/.test(password) ? "text-primary opacity-100" : ""}>{/[0-9]/.test(password) ? "✓" : "•"} Number</li>
                      </ul>
                    )}
                  </div>
                )}

                {isReset && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                    }}
                    className="text-left font-mono text-[10px] text-primary uppercase hover:underline"
                  >
                    ← Cancel Recovery
                  </button>
                )}

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm font-sans mb-4">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>{error}</div>
                      </div>
                    </motion.div>
                  )}
                  {message && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 text-primary text-sm font-sans mb-4">
                        <Check className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>{message}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isSignUp && (
                  <label className="flex items-start gap-2 font-mono text-[10px] uppercase text-muted-foreground cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 appearance-none w-3.5 h-3.5 border border-white/20 checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 relative
                        after:content-[''] after:absolute after:hidden checked:after:block after:left-[4px] after:top-[1px] after:w-1.5 after:h-2 after:border-r-[2px] after:border-b-[2px] after:border-white after:rotate-45"
                      required
                    />
                    <span className="leading-relaxed">
                      I accept the <Link to="/terms" className="text-primary hover:underline">Terms</Link> & <Link to="/privacy" className="text-primary hover:underline">Privacy</Link>
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={loading || (isSignUp && !agreedToTerms)}
                  className="w-full h-[44px] mt-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-sans font-bold flex justify-center items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all duration-150 relative overflow-hidden group border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] rounded-none disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-200"></span>
                  <span className="relative z-10 flex items-center gap-2">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Synchronizing...
                      </>
                    ) : isReset ? (
                      <>
                        <Mail className="w-4 h-4" /> Issue Recovery Command
                      </>
                    ) : isSignUp ? (
                      <>
                        Register Session <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    ) : (
                      <>
                        Verify Session <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
              <Link to="/" className="inline-flex items-center gap-1.5 hover:text-primary transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Abort
              </Link>
              <Link to="/showcase" className="hover:text-primary transition-colors hover:underline">
                Bypass to Demo
              </Link>
            </div>
          </main>

          {/* Footer Status Indicator */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-card/50 border border-white/5 px-4 py-2 backdrop-blur-sm z-10">
            <div className="relative flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(139,63,214,0.8)] z-10"></div>
              <div className="w-3 h-3 bg-primary/30 rounded-full absolute animate-ping"></div>
            </div>
            <span className="font-mono text-[10px] text-primary uppercase tracking-widest">Status: Nominal</span>
          </div>
        </div>
      </div>
    </>
  );
}
