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
import { emitProductEventOnce } from "../lib/product-event-client";

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
  return parts.join(" / ");
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
}: {
  disabled?: boolean;
  onError?: (message: string) => void;
  isSignUp?: boolean;
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
      label: "Outlook",
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
    <div className="space-y-3">
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

const AUTH_BRAND = {
  signin: {
    label: "Welcome back",
    headline: "Back on the line.",
    body: "Your profit agents, call history, and follow-ups are waiting.",
  },
  signup: {
    personal: {
      label: "Personal",
      headline: "Wire your agent.",
      body: "Build one AI profit agent, launch it on a real line, and see every result.",
    },
    business: {
      label: "Business",
      headline: "Call work, handled.",
      body: "Outbound, inbound, or hybrid profit agents — trained on your playbook and supervised from one workspace.",
    },
  },
} as const;

function AuthBrandPanel({
  headerActive,
  workspaceMode,
}: {
  headerActive: "signin" | "signup";
  workspaceMode: WorkspaceMode;
}) {
  const brand =
    headerActive === "signin"
      ? AUTH_BRAND.signin
      : workspaceMode === "business"
        ? AUTH_BRAND.signup.business
        : AUTH_BRAND.signup.personal;
  return (
    <aside className="wl-auth-brand-panel" aria-hidden="true">
      <div className="wl-auth-brand-glow" />
      <div className="wl-auth-brand-top">
        <Link to="/" className="wl-auth-brand-mark" tabIndex={-1}>
          <span className="wl-auth-brand-badge">
            <WirelineMark className="h-4 w-6" strokeWidth={10} />
          </span>
          <span className="wl-auth-brand-word">Wireline</span>
        </Link>
      </div>
      <div className="wl-auth-brand-copy">
        <p className="wl-auth-brand-label wl-eyebrow--wired">{brand.label}</p>
        <h2 className="wl-auth-brand-headline">{brand.headline}</h2>
        <p className="wl-auth-brand-body">{brand.body}</p>
      </div>
      <div className="wl-auth-brand-grid">
        {[
          ["Build", "Role and result"],
          ["Train", "Voice and rules"],
          ["Launch", "Number and tools"],
          ["Improve", "Outcomes and coaching"],
        ].map(([name, sub]) => (
          <div key={name} className="wl-auth-brand-grid-cell">
            <div className="wl-auth-brand-grid-name">{name}</div>
            <div className="wl-auth-brand-grid-sub">{sub}</div>
          </div>
        ))}
      </div>
    </aside>
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
    <div className="wl-stitch-auth-shell">
      <AuthBrandPanel headerActive={headerActive} workspaceMode={mode} />
      <main
        id="main-content"
        className="wl-auth-form-panel flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="w-full max-w-[440px]">
          <Link to="/" className="wl-auth-mobile-mark">
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
  const options: Array<{ id: WorkspaceMode; title: string; text: string; icon: ReactNode }> = [
    {
      id: "personal",
      title: "Personal",
      text: "One private profit agent for calls, texts, and follow-up on your terms.",
      icon: <User className="h-4 w-4" />,
    },
    {
      id: "business",
      title: "Business",
      text: "A shared phone operation with multiple employees, numbers, approvals, integrations, and analytics.",
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
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    () =>
      workspaceFromIntent(captureSignupIntentFromLocation()) ||
      readStoredWorkspaceMode() ||
      "personal",
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
    // After successful auth (email/OAuth), navigate to resolved post-auth dest.
    // Default is /overview (Home) for logged-in users. See auth-redirect.ts.
    navigate(resolvePostAuthDestination(workspaceMode, location.search), { replace: true });
  }, [authLoading, user, navigate, workspaceMode, location.search]);

  useEffect(() => {
    if (pathname === "/signup") setMode("signup");
    else setMode((m) => (m === "reset" ? "reset" : "signin"));
  }, [pathname]);

  const applyWorkspaceMode = (nextMode: WorkspaceMode) => {
    setWorkspaceMode(nextMode);
    persistWorkspaceMode(nextMode);
    setSignupIntent((current) =>
      persistSignupIntent(
        sanitizeSignupIntent({
          ...current,
          preferredPlanId: nextMode === "business" ? "business" : "personal",
          capturedAt: current?.capturedAt || new Date().toISOString(),
        }),
      ),
    );
  };

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
        // Explicit post-auth navigate (also covered by user effect above).
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
      ? "Create your Wireline account and build your first AI profit agent."
      : "Sign in to your Wireline account.";

  const headerActive = isSignUp ? "signup" : "signin";

  return (
    <>
      <PageMeta
        title={`${pageTitle} - Wireline`}
        description={pageDescription}
        path={isSignUp ? "/signup" : "/signin"}
        noIndex
      />
      <AuthShell mode={workspaceMode} headerActive={headerActive}>
        <div className="mb-6 text-center">
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
            <div className="grid grid-cols-2 border-b border-ink/10 p-1 mb-4">
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
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
                onError={(m) => setError(m || null)}
              />
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
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="wl-stitch-input h-11"
                      style={{ paddingLeft: "2.5rem", paddingRight: "2.75rem" }}
                      aria-label="Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/60 transition hover:bg-ink/5 hover:text-foreground"
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
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/50 p-3 text-sm leading-relaxed text-foreground/75">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    I agree to the{" "}
                    <Link
                      to="/terms"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                    >
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
      </AuthShell>
    </>
  );
}
