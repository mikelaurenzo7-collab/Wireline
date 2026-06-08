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
    <div className="space-y-3 mb-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {providers.map((p) => (
          <ShadButton
            key={p.id}
            type="button"
            variant="outline"
            disableAnimations
            onClick={() => start(p.id)}
            disabled={disabled || !!pending}
            aria-label={`Continue with ${p.label}`}
            className="oauth-btn min-h-[52px] py-2.5 h-auto flex-col gap-1 border-ink/[0.08] bg-paper/70 text-ink text-[11px] font-semibold"
          >
            {pending === p.id ? <Loader2 className="w-5 h-5 animate-spin" /> : p.icon}
            <span>{p.label}</span>
          </ShadButton>
        ))}
      </div>
      <div className="wl-form-divider" aria-hidden="true">
        <span>Or email</span>
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
        title={isSignUp ? "Create Account — Wireline" : "Sign In — Wireline"}
        description={
          isSignUp
            ? "Start your 14-day free Wireline trial — deploy an AI voice agent in under 10 minutes."
            : "Sign in to your Wireline operator console."
        }
        path={isSignUp ? "/signup" : "/signin"}
        noIndex
      />
      <div className="marketing-surface auth-portal-canvas min-h-dvh flex flex-col relative">
        <PublicSiteHeader
          active={isSignUp ? "signup" : "signin"}
          className="bg-paper/92 backdrop-blur-xl border-b border-ink/[0.06]"
        />

        <div className="relative z-10 flex flex-1 min-h-0 items-center justify-center px-4 sm:px-6 py-8 pt-20 sm:pt-24 pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[420px] mx-auto"
          >
            <div className="wl-auth-card rounded-md">
              <div className="p-6 sm:p-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="wl-auth-card-header mb-6">
                      <div className="wl-auth-brand-chip" aria-hidden="true">
                        <WirelineMark className="w-5 h-5" stroke="white" strokeWidth={120} />
                      </div>
                      <div>
                        <h1 className="font-display italic text-2xl sm:text-3xl text-ink leading-tight">
                          {isReset
                            ? "Reset password"
                            : isSignUp
                              ? "Create account"
                              : "Welcome back"}
                        </h1>
                        <p className="text-caption mt-1.5">
                          {isReset
                            ? "We'll email you a secure reset link."
                            : isSignUp
                              ? "14-day trial · no credit card"
                              : "Sign in to your operator console"}
                        </p>
                        {isSignUp && intentLabel && (
                          <p className="mt-2 inline-flex rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-eyebrow !text-brand">
                            From your visit · {intentLabel}
                          </p>
                        )}
                      </div>
                    </div>

                    {!isReset && (
                      <div className="mb-5">
                        <div className="relative flex p-1 bg-ink/[0.04] border border-ink/[0.06]">
                          <motion.div
                            layout
                            className="absolute inset-y-1 w-[calc(50%-4px)] bg-brand/10 border border-brand/20"
                            style={{ left: isSignUp ? "calc(50% + 2px)" : "4px" }}
                            transition={{ type: "spring", stiffness: 400, damping: 34 }}
                          />
                          {[
                            { label: "Sign in", value: false },
                            { label: "Sign up", value: true },
                          ].map((opt) => (
                            <ShadButton
                              key={String(opt.value)}
                              type="button"
                              variant="ghost"
                              disableAnimations
                              onClick={() => setIsSignUp(opt.value)}
                              className={cn(
                                "relative z-10 flex-1 h-auto py-2.5 text-sm font-semibold rounded-none",
                                isSignUp === opt.value ? "text-ink" : "text-muted hover:text-ink",
                              )}
                            >
                              {opt.label}
                            </ShadButton>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isReset && (
                      <OAuthSignInButtons disabled={loading} onError={(m) => setError(m || null)} />
                    )}

                    <form onSubmit={handleAuth} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="auth-email"
                          className="text-eyebrow flex items-center gap-1.5"
                        >
                          <Mail className="w-3.5 h-3.5 text-brand" />
                          Email
                        </Label>
                        <Input
                          id="auth-email"
                          type="email"
                          required
                          autoComplete="email"
                          inputMode="email"
                          spellCheck={false}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="auth-input"
                          placeholder="you@company.com"
                        />
                      </div>

                      {!isReset && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label
                              htmlFor="auth-password"
                              className="text-eyebrow flex items-center gap-1.5"
                            >
                              <Lock className="w-3.5 h-3.5 text-brand" />
                              Password
                            </Label>
                            {!isSignUp && (
                              <ShadButton
                                type="button"
                                variant="link"
                                disableAnimations
                                onClick={() => {
                                  setMode("reset");
                                  setError(null);
                                }}
                                className="text-caption font-medium text-brand h-auto p-0"
                              >
                                Forgot?
                              </ShadButton>
                            )}
                          </div>
                          <div className="relative">
                            <Input
                              id="auth-password"
                              type={showPassword ? "text" : "password"}
                              required
                              minLength={isSignUp ? 8 : undefined}
                              autoComplete={isSignUp ? "new-password" : "current-password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="auth-input pr-11"
                              placeholder="••••••••••••"
                            />
                            <ShadButton
                              type="button"
                              variant="ghost"
                              size="icon"
                              disableAnimations
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted hover:text-ink h-8 w-8"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              tabIndex={-1}
                            >
                              {showPassword ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </ShadButton>
                          </div>
                          {isSignUp && password.length > 0 && pwStrength && (
                            <>
                              <div className="pw-strength-bar mt-1.5">
                                <div
                                  className="pw-strength-fill"
                                  style={{
                                    width: `${(pwStrength.score / 4) * 100}%`,
                                    background: `linear-gradient(90deg, ${pwStrength.color}, ${pwStrength.score >= 3 ? BRAND.purple : pwStrength.color})`,
                                  }}
                                />
                              </div>
                              <p className="text-caption" style={{ color: pwStrength.color }}>
                                {pwStrength.label}
                              </p>
                            </>
                          )}
                          {isSignUp && (
                            <ul
                              className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-caption text-muted/80"
                              aria-label="Password requirements"
                            >
                              <li className={password.length >= 8 ? "text-brand" : ""}>
                                {password.length >= 8 ? "✓" : "•"} 8+ characters
                              </li>
                              <li className={/[A-Z]/.test(password) ? "text-brand" : ""}>
                                {/[A-Z]/.test(password) ? "✓" : "•"} Uppercase letter
                              </li>
                              <li className={/[a-z]/.test(password) ? "text-brand" : ""}>
                                {/[a-z]/.test(password) ? "✓" : "•"} Lowercase letter
                              </li>
                              <li className={/[0-9]/.test(password) ? "text-brand" : ""}>
                                {/[0-9]/.test(password) ? "✓" : "•"} Number
                              </li>
                            </ul>
                          )}
                        </div>
                      )}

                      {isReset && (
                        <ShadButton
                          type="button"
                          variant="link"
                          disableAnimations
                          onClick={() => {
                            setMode("signin");
                            setError(null);
                          }}
                          className="text-caption font-medium text-brand h-auto p-0 justify-start"
                        >
                          ← Back to sign in
                        </ShadButton>
                      )}

                      <AnimatePresence mode="wait">
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <Alert
                              variant="destructive"
                              className="flex items-start gap-2 p-3 [&>svg]:static [&>svg+div]:translate-y-0 [&>svg~*]:pl-0"
                            >
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <AlertDescription>{error}</AlertDescription>
                            </Alert>
                          </motion.div>
                        )}
                        {message && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <Alert className="flex items-start gap-2 p-3 border-brand/25 bg-brand/10 text-brand [&>svg]:static [&>svg]:text-brand [&>svg+div]:translate-y-0 [&>svg~*]:pl-0">
                              <Check className="w-4 h-4 shrink-0 mt-0.5" />
                              <AlertDescription className="text-brand">{message}</AlertDescription>
                            </Alert>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {isSignUp && (
                        <label className="flex items-start gap-2 text-caption cursor-pointer">
                          <Checkbox
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            className="mt-1 accent-brand"
                            required
                          />
                          <span>
                            I agree to the{" "}
                            <Link to="/terms" className="text-brand underline">
                              Terms
                            </Link>{" "}
                            and{" "}
                            <Link to="/privacy" className="text-brand underline">
                              Privacy
                            </Link>
                            .
                          </span>
                        </label>
                      )}

                      <ShadButton
                        type="submit"
                        variant="editorial"
                        disableAnimations
                        disabled={loading || (isSignUp && !agreedToTerms)}
                        className="w-full min-h-[48px] py-3.5 text-sm font-semibold"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Connecting…
                          </>
                        ) : isReset ? (
                          <>
                            <Mail className="w-4 h-4" /> Send reset link
                          </>
                        ) : isSignUp ? (
                          <>
                            <UserPlus className="w-4 h-4" /> Create account{" "}
                            <ArrowRight className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            Sign in <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </ShadButton>
                    </form>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-caption">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 font-medium text-ink/80 hover:text-ink"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to home
              </Link>
              <Link to="/showcase" className="font-medium text-brand hover:underline">
                Try live demo lines
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
