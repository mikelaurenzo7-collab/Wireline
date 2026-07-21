/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
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

import { useAuth } from "../contexts/AuthContext";
import { StatusNotice } from "./molecules";
import WirelineMark from "./brand/WirelineMark";
import { PageMeta } from "../lib/page-meta";
import {
  captureSignupIntentFromLocation,
  persistSignupIntent,
  sanitizeSignupIntent,
  syncSignupIntent,
  type SignupIntent,
  type SignupPlanId,
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
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { CUSTOMER_AGENT_LANGUAGE, customerAgentLanguage } from "../lib/product-copy";
import {
  captureDemoSourceFromLocation,
  readDemoSourceCookie,
} from "../lib/demo-attribution-client";
import { emitProductEventOnce } from "../lib/product-event-client";

/**
 * Redact common infrastructure/DB error leakage before surfacing anything to
 * the sign-in card. Server-side code owns being careful; this is defence in
 * depth so a slipped ORM/proxy string never lands in the UI.
 */
const UNSAFE_ERROR_PATTERNS = [
  /duplicate key value/i,
  /violates .* constraint/i,
  /relation ".*" does not exist/i,
  /supabase/i,
  /postgres|postgresql/i,
  /ECONNRE(SET|FUSED)/,
  /getaddrinfo /,
  /stack trace|\bat .* \(.*:\d+:\d+\)/i,
  /\{.*"stack"/,
  /^HTTP \d+/,
];

function isSafeErrorMessage(message: string): boolean {
  if (message.length > 240) return false;
  return !UNSAFE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function extractServerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [p.userMessage, p.error, p.message, (p.error as any)?.message];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && isSafeErrorMessage(c.trim())) return c.trim();
  }
  const details = p.details;
  if (Array.isArray(details) && details.length > 0) {
    const parts = details
      .map((d) => {
        if (!d || typeof d !== "object") return null;
        const row = d as { field?: unknown; message?: unknown };
        const raw = typeof row.message === "string" ? row.message.trim() : "";
        if (!raw || !isSafeErrorMessage(raw)) return null;
        const field = typeof row.field === "string" && row.field ? row.field : null;
        return field ? `${field}: ${raw}` : raw;
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

const SIGNUP_PLAN_LABELS = Object.fromEntries(
  STRIPE_PLANS.map((plan) => [
    plan.id,
    plan.price_usd_monthly === 0
      ? plan.name.replace(/^Wireline /, "")
      : `${plan.name.replace(/^Wireline /, "")} · $${plan.price_usd_monthly}/month`,
  ]),
) as Record<SignupPlanId, string>;

function signupIntentLabel(intent: SignupIntent | null): string | null {
  if (!intent?.preferredPlanId && !intent?.signupWedge) return null;
  const parts: string[] = [];
  if (intent.preferredPlanId) parts.push(SIGNUP_PLAN_LABELS[intent.preferredPlanId]);
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
  isSignUp = false,
  consentNeeded = false,
}: {
  disabled?: boolean;
  onError?: (message: string) => void;
  isSignUp?: boolean;
  consentNeeded?: boolean;
}) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const start = async (provider: OAuthProvider) => {
    if (disabled || pending) return;
    if (consentNeeded) {
      onError?.("Accept the Terms and Privacy Policy below to continue.");
      return;
    }
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
        // Drain the body but never surface it — a non-JSON response is usually
        // a proxy/CDN HTML error page, and echoing it leaks infra internals
        // onto the sign-in card. Show a clean, actionable message instead.
        await res.text().catch(() => "");
        throw new Error(
          `Sign-in is temporarily unavailable (HTTP ${res.status}). Try again, or use email below.`,
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

  const providers: Array<{
    id: OAuthProvider;
    label: string;
    mark: React.ReactNode;
  }> = [
    {
      id: "google",
      label: "Google",
      mark: (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09a7.18 7.18 0 0 1 0-4.17V7.07H2.18A11.97 11.97 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.98z"
            fill="#FBBC05"
          />
          <path
            d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z"
            fill="#EA4335"
          />
        </svg>
      ),
    },
    {
      id: "microsoft",
      label: "Microsoft",
      mark: (
        <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
          <rect x="1" y="1" width="9" height="9" fill="#F25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
      ),
    },
    {
      id: "yahoo",
      label: "Yahoo",
      mark: (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M2.2 5.6h4.6l3.65 6.55L14.1 5.6h4.5l-6.3 10.85V20.6H8.55v-4.15L2.2 5.6Z"
            fill="#6001D2"
          />
          <circle cx="18.7" cy="18.7" r="1.95" fill="#6001D2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="wl-auth-oauth space-y-3">
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => start(p.id)}
          disabled={disabled || !!pending}
          aria-label={`Continue with ${p.label}`}
          className="wl-stitch-oauth-btn"
        >
          {pending === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.mark}
          Continue with {p.label}
        </button>
      ))}
      <div className="wl-stitch-auth-divider">or {isSignUp ? "sign up" : "sign in"} with email</div>
    </div>
  );
}

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="wl-stitch-auth-shell">
      <main
        id="main-content"
        className="wl-auth-form-panel flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="w-full max-w-[520px]">
          <Link to="/" className="wl-auth-entry-mark" aria-label="Wireline home">
            <span className="wl-auth-brand-badge">
              <WirelineMark className="h-4 w-6" strokeWidth={10} />
            </span>
            <span>Wireline</span>
          </Link>
          <div className="wl-stitch-auth-card rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {children}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary hover:underline">
              Back to home
            </Link>
            <Link to="/showcase" className="hover:text-primary hover:underline">
              Hear a demo
            </Link>
            <Link to="/pricing" className="hover:text-primary hover:underline">
              View pricing
            </Link>
          </div>
        </div>
      </main>
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
  const options: Array<{
    id: WorkspaceMode;
    title: string;
    shortText: string;
    text: string;
    icon: ReactNode;
  }> = [
    {
      id: "personal",
      title: "Personal",
      shortText: "Just me",
      text: "A private agent for your calls, appointments, and follow-up.",
      icon: <User className="h-4 w-4" />,
    },
    {
      id: "business",
      title: "Business",
      shortText: "Team workspace",
      text: `Shared ${CUSTOMER_AGENT_LANGUAGE.business.plural}, numbers, approvals, and integrations.`,
      icon: <Building2 className="h-4 w-4" />,
    },
  ];
  return (
    <div className="wl-auth-workspace-selector mb-6 grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setMode(option.id)}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-left transition",
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
            <span className="wl-auth-workspace-short mt-0.5 text-[11px] text-muted-foreground sm:hidden">
              {option.shortText}
            </span>
            <span className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
              {option.text}
            </span>
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
  const isSignupRoute = pathname === "/signup" || pathname === "/get-started";
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    () =>
      workspaceFromIntent(captureSignupIntentFromLocation()) ||
      readStoredWorkspaceMode() ||
      "personal",
  );
  const initialMode: AuthMode = isSignupRoute ? "signup" : "signin";
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
    // Only capture and persist signup intent on the signup route. A visitor
    // hitting /signin?plan=business (e.g. from a marketing email) shouldn't
    // overwrite their stored plan preference or flip workspaceMode away from
    // their default.
    captureDemoSourceFromLocation();
    persistAuthRedirect(readRedirectFromSearch(location.search));
    if (!isSignupRoute) return;
    const intent = captureSignupIntentFromLocation();
    setSignupIntent(intent);
    if (intent) setWorkspaceMode(workspaceFromIntent(intent));
  }, [location.search, isSignupRoute]);

  useEffect(() => {
    persistWorkspaceMode(workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    if (authLoading || !user) return;
    // After successful auth (email/OAuth), navigate to resolved post-auth dest.
    // Default is /overview (Home) for logged-in users. See auth-redirect.ts.
    navigate(resolvePostAuthDestination(workspaceMode, location.search), {
      replace: true,
    });
  }, [authLoading, user, navigate, workspaceMode, location.search]);

  useEffect(() => {
    if (isSignupRoute) setMode("signup");
    else setMode((m) => (m === "reset" ? "reset" : "signin"));
  }, [isSignupRoute]);

  const applyWorkspaceMode = (nextMode: WorkspaceMode) => {
    setWorkspaceMode(nextMode);
    persistWorkspaceMode(nextMode);
    setSignupIntent((current) => {
      const preferredPlanId =
        nextMode === "personal"
          ? "personal"
          : current?.preferredPlanId && current.preferredPlanId !== "personal"
            ? current.preferredPlanId
            : "starter";

      return persistSignupIntent(
        sanitizeSignupIntent({
          ...current,
          preferredPlanId,
          capturedAt: current?.capturedAt || new Date().toISOString(),
        }),
      );
    });
  };

  const setIsSignUp = (value: boolean) => {
    setMode(value ? "signup" : "signin");
    setError(null);
    setMessage(null);
    const nextPath = value ? "/signup" : "/signin";
    if (location.pathname !== nextPath) {
      navigate(`${nextPath}${location.search}`);
    }
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
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
        if (isSignUp) {
          markFreshSignupSession();
          emitProductEventOnce({
            event: "signup_completed",
            accountId: data.user.id,
            metadata: {
              plan_id: attribution?.preferredPlanId ?? null,
              wedge: attribution?.signupWedge ?? null,
            },
          });
        }
        signIn({ user: data.user });
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
      ? `Build your first ${customerAgentLanguage(workspaceMode).singular}.`
      : "Welcome back to Wireline.";

  return (
    <>
      <PageMeta
        title={`${pageTitle} - Wireline`}
        description={pageDescription}
        path={isSignUp ? "/signup" : "/signin"}
        noIndex
      />
      <AuthShell>
        <div className="wl-auth-heading mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-[-.02em]">{pageTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{pageDescription}</p>
          {isSignUp && intentLabel ? (
            <p className="wl-stitch-label mt-3 inline-flex rounded-full border border-border bg-muted px-3 py-1">
              {intentLabel}
            </p>
          ) : null}
        </div>

        {isSignUp && !isReset && (
          <WorkspaceSelector mode={workspaceMode} setMode={applyWorkspaceMode} />
        )}

        <div>
          {!isReset && (
            <div
              className="wl-auth-tabs mb-4 grid grid-cols-2 border-b border-ink/10 p-1"
              role="tablist"
              aria-label="Account access"
            >
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                role="tab"
                aria-selected={!isSignUp}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition ${
                  !isSignUp
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                role="tab"
                aria-selected={isSignUp}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition ${
                  isSignUp
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Create account
              </button>
            </div>
          )}

          <div className="pt-2">
            {!isReset && (
              <OAuthSignInButtons
                disabled={loading}
                isSignUp={isSignUp}
                consentNeeded={isSignUp && !agreedToTerms}
                onError={(m) => setError(m || null)}
              />
            )}

            <form onSubmit={handleAuth} className="wl-auth-form mt-6 flex flex-col gap-5">
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
                    autoFocus
                    autoComplete="email"
                    spellCheck={false}
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="wl-stitch-input h-11"
                    style={{ paddingLeft: "2.5rem" }}
                    aria-label="Email address"
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
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
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
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignUp ? "At least 8 characters" : "Your password"}
                      className="wl-stitch-input h-11"
                      style={{ paddingLeft: "2.5rem", paddingRight: "2.75rem" }}
                      aria-label="Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-foreground/60 transition hover:bg-ink/5 hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {isSignUp && strengthLabel && (
                    <p className="text-xs text-foreground/55">
                      Password strength:{" "}
                      <span className="font-semibold text-foreground">{strengthLabel}</span>
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
                  className="inline-flex items-center gap-2 self-start text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </button>
              )}

              {error ? <StatusNotice tone="destructive" title={error} /> : null}
              {message && (
                <div className="flex items-start gap-2 rounded-xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] p-3 text-sm text-[var(--wireline-color-text-primary)]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--wireline-color-status-success)]" />
                  <div>{message}</div>
                </div>
              )}

              {isSignUp && (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm leading-relaxed text-foreground/75">
                  <input
                    id="auth-terms"
                    type="checkbox"
                    aria-labelledby="auth-terms-label"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span id="auth-terms-label">
                    <label htmlFor="auth-terms" className="cursor-pointer select-none">
                      I agree to the Wireline
                    </label>{" "}
                    <Link
                      to="/terms"
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (isSignUp && !agreedToTerms)}
                aria-disabled={loading || (isSignUp && !agreedToTerms)}
                className="mt-1 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:bg-[color:var(--wireline-color-action-primary-pressed)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working...
                  </>
                ) : isReset ? (
                  <>
                    Send reset link
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : isSignUp ? (
                  <>
                    Create account
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </AuthShell>
    </>
  );
}
