/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";

import PublicSiteHeader from "./marketing/PublicSiteHeader";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import {
  captureSignupIntentFromLocation,
  sanitizeSignupIntent,
  syncSignupIntent,
  type SignupIntent,
} from "../lib/signup-intent";
import {
  persistAuthRedirect,
  persistWorkspaceMode,
  readRedirectFromSearch,
  readStoredWorkspaceMode,
  resolvePostAuthDestination,
  workspaceFromIntent,
  type WorkspaceMode,
} from "../lib/auth-redirect";
import { getPasswordPolicyError } from "../lib/password-policy";
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

function getPasswordStrengthLabel(password: string): string | null {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return "Weak";
  if (score === 2) return "Fair";
  if (score === 3) return "Good";
  return "Strong";
}

type AuthMode = "signin" | "signup" | "reset";

type OAuthProvider = "google" | "microsoft" | "yahoo";

function OAuthSignInButtons({
  disabled,
  onError,
}: {
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const start = async (provider: OAuthProvider) => {
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
          `Sign-in service returned ${res.status} ${res.statusText || ""}. ${
            bodySnippet ? `Details: ${bodySnippet}` : "The server may be misconfigured."
          }`.trim(),
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
      onError?.(
        detail
          ? `${providerLabel} sign-in failed: ${detail}`
          : `${providerLabel} sign-in failed. Please try again or use email below.`,
      );
    }
  };

  const providers: Array<{ id: OAuthProvider; label: string; mark: React.ReactNode }> = [
    {
      id: "google",
      label: "Gmail",
      mark: <span className="text-[18px] font-semibold text-[#4285F4]">G</span>,
    },
    {
      id: "microsoft",
      label: "Outlook",
      mark: (
        <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
          <span className="block h-2 w-2 bg-[#F25022]" />
          <span className="block h-2 w-2 bg-[#7FBA00]" />
          <span className="block h-2 w-2 bg-[#00A4EF]" />
          <span className="block h-2 w-2 bg-[#FFB900]" />
        </span>
      ),
    },
    {
      id: "yahoo",
      label: "Yahoo",
      mark: <span className="text-[18px] font-semibold text-brand">Y</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => start(p.id)}
            disabled={disabled || !!pending}
            aria-label={`Continue with ${p.label}`}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-ink/10 bg-card text-sm font-medium text-foreground shadow-sm transition hover:border-brand/30 hover:bg-card-warm/40 focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {pending === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.mark}
            <span className="hidden sm:inline">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-foreground/60">
        <span className="h-px flex-1 bg-ink/10" />
        <span>Email</span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>
    </div>
  );
}

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function AuthLogo({ light = false }: { light?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-xl tracking-tight",
        light ? "text-paper" : "text-foreground",
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center bg-brand text-[12px] text-paper">W</span>
      Wireline
    </span>
  );
}

function AuthChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 border border-brand bg-brand/8 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-brand",
        className,
      )}
    >
      {children}
    </span>
  );
}

function AuthShell({
  children,
  mode,
  headerActive,
}: {
  children: ReactNode;
  mode: WorkspaceMode;
  headerActive: "signin" | "signup";
}) {
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex">
        <div className="absolute right-[-12rem] top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand/30 blur-3xl" />
        <div className="relative z-10">
          <Link to="/">
            <AuthLogo light />
          </Link>
        </div>
        <div className="relative z-10 max-w-xl">
          <AuthChip className="border-paper/20 bg-card/5 text-paper/70">
            {mode === "personal" ? "Personal workspace" : "Business workspace"}
          </AuthChip>
          <h2 className="mt-5 font-display text-5xl leading-tight tracking-tight">
            {mode === "personal"
              ? "Your Personal Wireline Assistant."
              : "Your Business Wireline Assistants, in one place."}
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/65">
            {mode === "personal"
              ? "Screen calls, block spam, and keep your day moving — your assistant handles the phone so you don't have to."
              : "Set up AI voice, SMS, and email assistants with the tools, training, and approvals your team already uses."}
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-px border border-paper/10 bg-card/10 text-center">
          {[
            ["Gmail", "OAuth"],
            ["Outlook", "OAuth"],
            ["Yahoo", "OAuth"],
          ].map(([a, b]) => (
            <div key={a} className="bg-card/[.03] p-4">
              <div className="font-display text-xl">{a}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-paper/45">{b}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-screen flex-col">
        <div className="lg:hidden">
          <PublicSiteHeader active={headerActive} />
        </div>
        <main
          id="main-content"
          className="relative z-10 flex flex-1 items-center justify-center px-5 py-16 sm:px-6 lg:py-10"
        >
          <div className="w-full max-w-[460px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function WorkspaceSelector({
  mode,
  setMode,
}: {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}) {
  const options: Array<{ id: WorkspaceMode; title: string; text: string; icon: ReactNode }> = [
    {
      id: "personal",
      title: "Personal",
      text: "One private assistant for calls, reminders, Siri, CarPlay, and widgets.",
      icon: <User className="h-4 w-4" />,
    },
    {
      id: "business",
      title: "Business",
      text: "A workspace for agent fleets, training, integrations, analytics, and teams.",
      icon: <Building2 className="h-4 w-4" />,
    },
  ];
  return (
    <div className="mb-6 grid gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setMode(option.id)}
          className={cn(
            "flex items-start gap-3 border p-4 text-left transition",
            mode === option.id
              ? "border-brand bg-brand/10"
              : "border-border bg-background hover:border-brand/40",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full",
              mode === option.id ? "bg-brand text-paper" : "bg-secondary text-foreground",
            )}
          >
            {option.icon}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {option.title}
              {mode === option.id && <Check className="h-4 w-4 text-brand" />}
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function AuthPortal() {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
    workspaceFromIntent(captureSignupIntentFromLocation()) || readStoredWorkspaceMode(),
  );
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
  const intentLabel = signupIntentLabel(signupIntent);
  const strengthLabel = isSignUp ? getPasswordStrengthLabel(password) : null;

  useEffect(() => {
    setSignupIntent(captureSignupIntentFromLocation());
    captureDemoSourceFromLocation();
    persistAuthRedirect(readRedirectFromSearch(location.search));
    const intent = captureSignupIntentFromLocation();
    if (intent) setWorkspaceMode(workspaceFromIntent(intent));
  }, [location.search]);

  useEffect(() => {
    persistWorkspaceMode(workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    if (authLoading || !user) return;
    navigate(resolvePostAuthDestination(workspaceMode, location.search), { replace: true });
  }, [authLoading, user, navigate, workspaceMode, location.search]);

  useEffect(() => {
    if (pathname === "/signup") setMode("signup");
    else setMode((m) => (m === "reset" ? "reset" : "signin"));
  }, [pathname]);

  const setIsSignUp = (value: boolean) => {
    setMode(value ? "signup" : "signin");
    setError(null);
    setMessage(null);
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
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
    if (isSignUp && !agreedToTerms) {
      setError("Accept the Terms and Privacy Policy to create your account.");
      return;
    }

    setLoading(true);
    try {
      if (isReset) {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
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
                : "Password reset request failed."),
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
          credentials: "include",
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
                : "Authentication failed."),
          );
        }
        await syncSignupIntent(signupIntent).catch(() => {});
        if (!data.user?.id) {
          throw new Error("Authentication succeeded but user payload was missing.");
        }
        if (isSignUp) markFreshSignupSession();
        signIn({ user: data.user });
        navigate(resolvePostAuthDestination(workspaceMode, location.search), { replace: true });
      }
    } catch (err: unknown) {
      setError(cleanThrownMessage(err) || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const pageTitle = isReset ? "Reset your password" : isSignUp ? "Create your account" : "Sign in";
  const pageDescription = isReset
    ? "Enter your email and Wireline will send a secure password reset link."
    : isSignUp
      ? "Create your Wireline account and launch your first AI voice agent."
      : "Sign in to your Wireline workspace.";

  const headerActive = isSignUp ? "signup" : "signin";

  return (
    <>
      <PageMeta
        title={`${pageTitle} — Wireline`}
        description={pageDescription}
        path={isSignUp ? "/signup" : "/signin"}
        noIndex
      />
      <AuthShell mode={workspaceMode} headerActive={headerActive}>
        <div className="mb-8 text-center lg:text-left">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">
            Wireline account
          </p>
          <h1 className="font-display text-4xl italic tracking-tight text-foreground sm:text-5xl">
            {pageTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-foreground/65 lg:mx-0">
            {pageDescription}
          </p>
          {isSignUp && intentLabel && (
            <p className="mt-4 inline-flex rounded-sm border border-brand/20 bg-brand/8 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
              {intentLabel}
            </p>
          )}
        </div>

        {isSignUp && !isReset && (
          <WorkspaceSelector
            mode={workspaceMode}
            setMode={(next) => {
              setWorkspaceMode(next);
              persistWorkspaceMode(next);
            }}
          />
        )}

        <div className="rounded-md border border-ink/10 bg-card shadow-[0_24px_80px_-56px_rgba(30,27,46,0.55)]">
              {!isReset && (
                <div className="grid grid-cols-2 border-b border-ink/10 p-1">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className={`min-h-[48px] rounded-sm text-sm font-semibold transition ${
                      !isSignUp
                        ? "bg-brand text-white shadow-sm"
                        : "text-foreground/65 hover:bg-ink/5 hover:text-foreground"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSignUp(true)}
                    className={`min-h-[48px] rounded-sm text-sm font-semibold transition ${
                      isSignUp
                        ? "bg-brand text-white shadow-sm"
                        : "text-foreground/65 hover:bg-ink/5 hover:text-foreground"
                    }`}
                  >
                    Create account
                  </button>
                </div>
              )}

              <div className="p-6 sm:p-7">
                {!isReset && (
                  <OAuthSignInButtons disabled={loading} onError={(m) => setError(m || null)} />
                )}

                <form onSubmit={handleAuth} className="mt-6 flex flex-col gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground" htmlFor="auth-email">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60" />
                      <input
                        id="auth-email"
                        type="email"
                        required
                        autoComplete="email"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 w-full rounded-md border border-ink/12 bg-card-warm/40 pl-10 pr-3 text-base text-foreground outline-none transition placeholder:text-foreground/55 focus:border-brand focus:ring-4 focus:ring-brand/12"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  {!isReset && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          className="text-sm font-semibold text-foreground"
                          htmlFor="auth-password"
                        >
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
                            className="text-sm font-medium text-brand hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60" />
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={isSignUp ? 8 : undefined}
                          autoComplete={isSignUp ? "new-password" : "current-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 w-full rounded-md border border-ink/12 bg-card-warm/40 pl-10 pr-11 text-base text-foreground outline-none transition placeholder:text-foreground/55 focus:border-brand focus:ring-4 focus:ring-brand/12"
                          placeholder={
                            isSignUp ? "Create a secure password" : "Enter your password"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/60 transition hover:bg-ink/5 hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {isSignUp && strengthLabel && (
                        <p className="text-xs text-foreground/55">
                          Password strength:{" "}
                          <span className="font-semibold text-brand">{strengthLabel}</span>
                        </p>
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
                      className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand hover:underline"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to sign in
                    </button>
                  )}

                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-600">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>{error}</div>
                    </div>
                  )}
                  {message && (
                    <div className="flex items-start gap-2 rounded-md border border-brand/20 bg-brand/10 p-3 text-sm text-brand">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>{message}</div>
                    </div>
                  )}

                  {isSignUp && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-ink/8 bg-card-warm/30 p-3 text-sm leading-relaxed text-foreground/75">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-brand"
                      />
                      <span>
                        I agree to the{" "}
                        <Link to="/terms" className="font-medium text-brand hover:underline">
                          Terms
                        </Link>{" "}
                        and{" "}
                        <Link to="/privacy" className="font-medium text-brand hover:underline">
                          Privacy Policy
                        </Link>
                        .
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={loading || (isSignUp && !agreedToTerms)}
                    aria-disabled={loading || (isSignUp && !agreedToTerms)}
                    className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-base font-semibold text-white shadow-[0_18px_50px_-28px_rgba(124,58,237,0.9)] transition hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-brand/25 disabled:cursor-not-allowed disabled:bg-brand/35 disabled:text-white/80"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Working…
                      </>
                    ) : isReset ? (
                      <>
                        Send reset link
                        <ArrowRight className="h-4 w-4" />
                      </>
                    ) : isSignUp ? (
                      <>
                        Create account
                        <ArrowRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-foreground/55 lg:justify-start">
          <Link to="/" className="hover:text-brand hover:underline">
            Back to home
          </Link>
          <Link to="/showcase" className="hover:text-brand hover:underline">
            View live demos
          </Link>
          <Link to="/pricing" className="hover:text-brand hover:underline">
            Compare plans
          </Link>
        </div>
      </AuthShell>
    </>
  );
}
