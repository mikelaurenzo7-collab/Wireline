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

function AuthShell({
  children,
  mode,
  headerActive,
}: {
  children: ReactNode;
  mode: WorkspaceMode;
  headerActive: "signin" | "signup";
}) {
  void mode;
  void headerActive;
  return (
    <div className="wl-stitch-auth-shell">
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-6 text-center">
            <Link to="/" className="text-2xl font-bold tracking-[-.03em] text-primary">
              Wireline
            </Link>
            <h1 className="wl-stitch-headline mt-3">
              {headerActive === "signup" ? "Create your account" : "Welcome Back"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "personal"
                ? "Sign in to manage your call assistant."
                : "Sign in to your assistant workspace."}
            </p>
          </div>
          <div className="wl-stitch-auth-card">{children}</div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary hover:underline">
              Back to home
            </Link>
            <Link to="/showcase" className="hover:text-primary hover:underline">
              Hear a demo
            </Link>
            <Link to="/pricing" className="hover:text-primary hover:underline">
              Compare plans
            </Link>
          </div>
        </div>
      </main>
      <footer className="mt-auto border-t border-border bg-card px-6 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <span className="font-bold text-primary">Wireline</span>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-primary hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-primary hover:underline">
              Terms
            </Link>
            <Link to="/support" className="hover:text-primary hover:underline">
              Support
            </Link>
          </div>
        </div>
      </footer>
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
      text: "One private assistant that makes calls for you, waits on hold, and texts you the answer.",
      icon: <User className="h-4 w-4" />,
    },
    {
      id: "business",
      title: "Business",
      text: "A workspace for multiple agents, team training, integrations, and analytics.",
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
      ? "Create your Wireline account and set up your personal assistant."
      : "Sign in to your Wireline account.";

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
          <WorkspaceSelector
            mode={workspaceMode}
            setMode={(next) => {
              setWorkspaceMode(next);
              persistWorkspaceMode(next);
            }}
          />
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
                    className="wl-stitch-input h-11 pl-10"
                    placeholder="you@email.com"
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
                      className="wl-stitch-input h-11 pl-10 pr-11"
                      placeholder={isSignUp ? "Create a secure password" : "Enter your password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/60 transition hover:bg-ink/5 hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{error}</div>
                </div>
              )}
              {message && (
                <div className="flex items-start gap-2 rounded-xl border border-border bg-muted p-3 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
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
                className="mt-1 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:bg-[color:var(--wl-accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
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
      </AuthShell>
    </>
  );
}
