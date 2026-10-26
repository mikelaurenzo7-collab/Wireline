/* eslint-disable @typescript-eslint/no-explicit-any -- auth endpoint payloads are intentionally defensive at this boundary. */
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import { useAuth } from "../../contexts/AuthContext";
import { canonicalLegacyBrowserHandoff } from "../../lib/canonical-browser-origin";
import {
  persistAuthRedirect,
  persistOAuthReturnFromSearch,
  persistWorkspaceMode,
  readRedirectFromSearch,
  readStoredWorkspaceMode,
  resolvePostAuthDestination,
  workspaceFromIntent,
  type WorkspaceMode,
} from "../../lib/auth-redirect";
import {
  captureSignupIntentFromLocation,
  persistSignupIntent,
  sanitizeSignupIntent,
  signupTemplateLabel,
  syncSignupIntent,
  type SignupIntent,
  type SignupPlanId,
} from "../../lib/signup-intent";
import { getPasswordPolicyError } from "../../lib/password-policy";
import {
  emailVerificationSignInNotice,
  readEmailVerificationReturn,
} from "../../lib/email-verification-return";
import { clearFreshSignupSession, markFreshSignupSession } from "../../lib/post-signup-onboarding";
import { STRIPE_PLANS, USAGE_PLAN } from "../../lib/plan-catalog";
import { usageTier, publicUsageTierId, type UsageTierId } from "../../lib/usage-billing-catalog";
import { getPlanDisplayLabel } from "../../lib/plan-display";
import {
  captureDemoSourceFromLocation,
  readDemoSourceCookie,
} from "../../lib/demo-attribution-client";
import { emitProductEventOnce } from "../../lib/product-event-client";
import { isAllowedOAuthUrl } from "../../lib/oauth-url";
import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_PRIVACY_VERSION_HEADER,
  ACCOUNT_TERMS_VERSION,
  ACCOUNT_TERMS_VERSION_HEADER,
} from "../../lib/legal-consent";
import { StatusNotice } from "../molecules";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { WirelineLockup } from "../brand/WirelineBrand";
import { usePaidPlanAvailability } from "../../hooks/usePaidPlanAvailability";

type AuthMode = "signin" | "signup" | "reset";
type AuthField = "email" | "password";
type OAuthProvider = "google" | "microsoft" | "yahoo";
type OAuthProviderAvailability = Record<OAuthProvider, boolean>;

export type AuthAccessPanelProps = {
  initialMode?: Exclude<AuthMode, "reset">;
  embedded?: boolean;
  showBrand?: boolean;
  className?: string;
};

const TERMS_CONSENT_ERROR = "Accept the Terms and Privacy Policy above to continue.";
const PASSWORD_RULES: ReadonlyArray<{ label: string; test: (value: string) => boolean }> = [
  { label: "8+ characters", test: (value) => value.length >= 8 },
  { label: "uppercase", test: (value) => /[A-Z]/.test(value) },
  { label: "lowercase", test: (value) => /[a-z]/.test(value) },
  { label: "number", test: (value) => /[0-9]/.test(value) },
];

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

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function isSafeErrorMessage(message: string): boolean {
  return message.length <= 240 && !UNSAFE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function extractServerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    row.userMessage,
    row.error,
    row.message,
    (row.error as any)?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const message = candidate.trim();
    if (message && isSafeErrorMessage(message)) return message;
  }
  return null;
}

function cleanThrownMessage(error: unknown): string | null {
  const raw = (error as { message?: unknown })?.message;
  if (typeof raw !== "string") return null;
  const message = raw.trim();
  if (!message || message === "[object Object]" || !isSafeErrorMessage(message)) return null;
  return message;
}

function publicSignupPlan(planId: SignupPlanId | null | undefined) {
  if (planId === "usage") return USAGE_PLAN;
  return planId
    ? STRIPE_PLANS.find((candidate) => candidate.id === planId && candidate.public !== false)
    : undefined;
}

function signupPlanLabel(
  planId: SignupPlanId,
  interval: SignupIntent["preferredBillingInterval"],
  tier?: UsageTierId,
): string | null {
  // Retired plans stay valid in old links but are never shown as an ID.
  const plan = publicSignupPlan(planId);
  if (!plan) return null;
  const name = getPlanDisplayLabel(plan);
  if (plan.id === "usage")
    return `${usageTier(publicUsageTierId(tier)).name} · $${usageTier(publicUsageTierId(tier)).monthlyUsd}/month plus usage`;
  if (plan.price_usd_monthly === 0) return name;
  return interval === "year"
    ? `${name} · $${plan.price_usd_annual}/year`
    : `${name} · $${plan.price_usd_monthly}/month`;
}

function signupIntentLabel(intent: SignupIntent | null): string | null {
  if (!intent?.preferredPlanId && !intent?.preferredTemplateId && !intent?.signupWedge) return null;
  const parts: string[] = [];
  const planLabel = intent.preferredPlanId
    ? signupPlanLabel(
        intent.preferredPlanId,
        intent.preferredBillingInterval,
        intent.preferredUsageTier,
      )
    : null;
  if (planLabel) parts.push(planLabel);
  if (intent.preferredTemplateId) {
    parts.push(signupTemplateLabel(intent.preferredTemplateId));
  }
  if (intent.signupWedge) {
    parts.push(
      intent.signupWedge
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

function defaultFreeIntent(current: SignupIntent | null): SignupIntent | null {
  if (current) return current;
  return persistSignupIntent({
    preferredPlanId: "personal",
    preferredBillingInterval: "month",
    capturedAt: new Date().toISOString(),
  });
}

const PROVIDERS: Array<{
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
          transform="scale(0.82 1)"
        />
        <path d="M17.6 4.2h3.2l-.7 10.4h-1.8L17.6 4.2Z" fill="#6001D2" />
        <circle cx="19.2" cy="18.6" r="1.95" fill="#6001D2" />
      </svg>
    ),
  },
];

export default function AuthAccessPanel({
  initialMode = "signin",
  embedded = false,
  showBrand = true,
  className,
}: AuthAccessPanelProps) {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const verificationReturn = readEmailVerificationReturn(location.search);
  const verificationNotice = verificationReturn
    ? emailVerificationSignInNotice(verificationReturn)
    : null;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  // State updates render the pending UI; this ref also fences events that fire
  // before React commits that render, across email and OAuth entry paths.
  const requestPendingRef = useRef(false);
  const [availableProviders, setAvailableProviders] = useState<OAuthProviderAvailability | null>(
    null,
  );
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem("wireline_auth_notice");
      if (!notice) return;
      sessionStorage.removeItem("wireline_auth_notice");
      setMessage(notice);
    } catch {
      // The sign-in form still works when storage is blocked.
    }
  }, []);
  const [invalidField, setInvalidField] = useState<AuthField | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const [signupIntent, setSignupIntent] = useState<SignupIntent | null>(() =>
    captureSignupIntentFromLocation(),
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    const intent = captureSignupIntentFromLocation();
    return workspaceFromIntent(intent) || readStoredWorkspaceMode() || "personal";
  });

  const isSignUp = mode === "signup";
  const isReset = mode === "reset";
  const intentLabel = signupIntentLabel(signupIntent);
  const paidSignupPlan =
    signupIntent?.preferredPlanId && publicSignupPlan(signupIntent.preferredPlanId)
      ? signupIntent.preferredPlanId
      : undefined;
  const {
    notice,
    billingModel,
    status: planStatus,
  } = usePaidPlanAvailability({
    enabled: isSignUp && Boolean(paidSignupPlan),
    interval: signupIntent?.preferredBillingInterval === "year" ? "year" : "month",
    planId: paidSignupPlan,
  });
  useEffect(() => {
    if (
      !isSignUp ||
      !signupIntent ||
      billingModel !== "usage" ||
      !paidSignupPlan ||
      paidSignupPlan === "usage"
    )
      return;
    // A returning visitor can carry a retired offer in browser storage or an old link.
    // Keep their use case while moving unpaid signup intent to the current offer.
    const currentOffer = persistSignupIntent({
      ...signupIntent,
      preferredPlanId: "usage",
      preferredBillingInterval: "month",
    });
    setSignupIntent(currentOffer);
  }, [isSignUp, billingModel, paidSignupPlan, signupIntent]);
  const oauthProviders = availableProviders
    ? PROVIDERS.filter((provider) => availableProviders[provider.id] === true)
    : [];

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const legacyBrowserHandoffUrl =
    typeof window === "undefined" ? null : canonicalLegacyBrowserHandoff(window.location);

  useEffect(() => {
    if (legacyBrowserHandoffUrl) window.location.replace(legacyBrowserHandoffUrl);
  }, [legacyBrowserHandoffUrl]);

  useEffect(() => {
    captureDemoSourceFromLocation();
    persistAuthRedirect(readRedirectFromSearch(location.search));
    const intent = captureSignupIntentFromLocation();
    if (intent) {
      setSignupIntent(intent);
      setWorkspaceMode(workspaceFromIntent(intent));
    }
  }, [location.search]);

  useEffect(() => {
    persistWorkspaceMode(workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    if (legacyBrowserHandoffUrl) return;
    const controller = new AbortController();
    void fetch("/api/auth/providers", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json().catch(() => null)) as {
          providers?: Partial<OAuthProviderAvailability>;
        } | null;
        const providers = payload?.providers;
        if (!providers) return null;
        return {
          google: providers.google === true,
          microsoft: providers.microsoft === true,
          yahoo: providers.yahoo === true,
        } satisfies OAuthProviderAvailability;
      })
      .then((providers) => {
        if (providers && !controller.signal.aborted) setAvailableProviders(providers);
      })
      .catch(() => {
        // Fail closed: email remains available without rendering dead provider actions.
      });
    return () => controller.abort();
  }, [legacyBrowserHandoffUrl]);

  useEffect(() => {
    if (legacyBrowserHandoffUrl) return;
    if (authLoading || !user) return;
    navigate(resolvePostAuthDestination(workspaceMode, location.search), { replace: true });
  }, [authLoading, user, navigate, workspaceMode, location.search, legacyBrowserHandoffUrl]);

  const changeMode = (next: AuthMode) => {
    if (requestPendingRef.current) return;
    setMode(next);
    setError(null);
    setMessage(null);
    setInvalidField(null);
    if (next === "signup") {
      setSignupIntent((current) => defaultFreeIntent(current));
    }
    if (!embedded && next !== "reset") {
      const nextPath = next === "signup" ? "/signup" : "/signin";
      if (location.pathname !== nextPath) navigate(`${nextPath}${location.search}`);
    }
  };

  const startOAuth = async (provider: OAuthProvider) => {
    if (requestPendingRef.current) return;
    if (isSignUp && !agreedToTerms) {
      setInvalidField(null);
      setError(TERMS_CONSENT_ERROR);
      termsRef.current?.focus();
      return;
    }
    requestPendingRef.current = true;
    setOauthPending(provider);
    setError(null);
    setInvalidField(null);
    try {
      const response = await fetch(`/api/auth/${provider}/url`, {
        headers: {
          Accept: "application/json",
          ...(isSignUp
            ? {
                [ACCOUNT_TERMS_VERSION_HEADER]: ACCOUNT_TERMS_VERSION,
                [ACCOUNT_PRIVACY_VERSION_HEADER]: ACCOUNT_PRIVACY_VERSION,
              }
            : {}),
        },
        credentials: "same-origin",
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        await response.text().catch(() => "");
        throw new Error("Signing in is temporarily unavailable. Try again or use email.");
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          extractServerErrorMessage(payload) || `Could not sign in with ${provider}.`,
        );
      }
      if (!isAllowedOAuthUrl(payload?.url)) {
        throw new Error("Received an invalid sign in URL.");
      }
      persistOAuthReturnFromSearch(location.search);
      // OAuth completion receives the database-authoritative new-user result.
      // Clear any abandoned/stale marker before leaving this browser context.
      clearFreshSignupSession();
      window.location.assign(payload.url);
    } catch (caught) {
      requestPendingRef.current = false;
      setOauthPending(null);
      setError(cleanThrownMessage(caught) || "Signing in is temporarily unavailable.");
    }
  };

  const showEmailError = (message: string) => {
    setInvalidField("email");
    setError(message);
    emailRef.current?.focus();
  };

  const showPasswordError = (message: string) => {
    setInvalidField("password");
    setError(message);
    passwordRef.current?.focus();
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requestPendingRef.current) return;
    setError(null);
    setMessage(null);
    setInvalidField(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showEmailError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showEmailError("Enter a valid email address.");
      return;
    }
    if (!isReset && !password) {
      showPasswordError("Password is required.");
      return;
    }
    const passwordPolicyError = isSignUp ? getPasswordPolicyError(password) : null;
    if (passwordPolicyError) {
      showPasswordError(passwordPolicyError);
      return;
    }
    if (isSignUp && !agreedToTerms) {
      setError(TERMS_CONSENT_ERROR);
      termsRef.current?.focus();
      return;
    }

    requestPendingRef.current = true;
    setLoading(true);
    try {
      if (isReset) {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: trimmedEmail }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(extractServerErrorMessage(payload) || "Password reset request failed.");
        }
        setMessage(payload.message || "If that email is registered, a reset link is on its way.");
        return;
      }

      const effectiveIntent = isSignUp
        ? defaultFreeIntent(sanitizeSignupIntent(signupIntent))
        : null;
      if (isSignUp && effectiveIntent !== signupIntent) setSignupIntent(effectiveIntent);
      const demoSource = isSignUp ? readDemoSourceCookie() : null;
      if (isSignUp) {
        emitProductEventOnce({
          event: "signup_started",
          surface: "marketing_web",
          metadata: {
            scope: embedded ? "landing_auth_panel" : "public_signup_form",
            plan_id: effectiveIntent?.preferredPlanId ?? null,
            billing_interval: effectiveIntent?.preferredBillingInterval ?? null,
            wedge: effectiveIntent?.signupWedge ?? null,
          },
        });
      }

      const response = await fetch(isSignUp ? "/api/auth/signup" : "/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          ...(effectiveIntent
            ? {
                preferredPlanId: effectiveIntent.preferredPlanId,
                preferredBillingInterval: effectiveIntent.preferredBillingInterval,
                signupWedge: effectiveIntent.signupWedge,
                utmSource: effectiveIntent.utmSource,
                utmMedium: effectiveIntent.utmMedium,
                utmCampaign: effectiveIntent.utmCampaign,
              }
            : {}),
          ...(demoSource ? { demoSource } : {}),
          ...(isSignUp
            ? {
                termsAccepted: true,
                termsVersion: ACCOUNT_TERMS_VERSION,
                privacyVersion: ACCOUNT_PRIVACY_VERSION,
              }
            : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          extractServerErrorMessage(payload) ||
            (response.status >= 500
              ? "Server temporarily unavailable. Please try again shortly."
              : "Authentication failed."),
        );
      }
      if (!payload.user?.id)
        throw new Error("Authentication succeeded but user payload was missing.");

      if (isSignUp) {
        void syncSignupIntent(effectiveIntent).catch(() => {});
        markFreshSignupSession();
        emitProductEventOnce({
          event: "signup_completed",
          accountId: payload.user.id,
          metadata: {
            plan_id: effectiveIntent?.preferredPlanId ?? null,
            billing_interval: effectiveIntent?.preferredBillingInterval ?? null,
            wedge: effectiveIntent?.signupWedge ?? null,
          },
        });
      }
      signIn({ user: payload.user });
    } catch (caught) {
      setError(cleanThrownMessage(caught) || "Authentication failed. Please try again.");
    } finally {
      requestPendingRef.current = false;
      setLoading(false);
    }
  };

  const title = isReset ? "Reset Password" : isSignUp ? "Create Account" : "Sign In";
  const disabled = loading || Boolean(oauthPending);
  const termsId = embedded ? "landing-auth-terms" : "auth-terms";
  const termsLabelId = `${termsId}-label`;
  const termsErrorId = `${termsId}-error`;
  const emailErrorId = embedded ? "landing-auth-email-error" : "auth-email-error";
  const passwordErrorId = embedded ? "landing-auth-password-error" : "auth-password-error";
  const emailInputId = embedded ? "landing-auth-email" : "auth-email";
  const passwordInputId = embedded ? "landing-auth-password" : "auth-password";
  const passwordRulesId = `${passwordInputId}-rules`;
  const errorId =
    error === TERMS_CONSENT_ERROR
      ? termsErrorId
      : invalidField === "email"
        ? emailErrorId
        : invalidField === "password"
          ? passwordErrorId
          : undefined;

  if (legacyBrowserHandoffUrl) {
    return (
      <section
        className={cn("wl-access-panel", embedded && "is-embedded", className)}
        aria-label="Opening BotBound"
      >
        <div className="wl-access-panel__card" role="status" aria-live="polite">
          <div className="flex min-h-24 items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>Opening BotBound…</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn("wl-access-panel", embedded && "is-embedded", className)}
      aria-label="Account access"
    >
      {showBrand ? (
        <div className="wl-access-panel__brand">
          <Link to="/" aria-label="BotBound home">
            <WirelineLockup size={embedded ? "standard" : "large"} />
          </Link>
        </div>
      ) : null}

      <div className="wl-access-panel__card">
        <header className="wl-access-panel__heading">
          {embedded ? <h2>{title}</h2> : <h1>{title}</h1>}
          {embedded && isSignUp ? (
            <div className="wl-access-panel__welcome">
              <p>Your First Bot Starts Here</p>
              <span>Set up your Bot, then rehearse privately before you activate it.</span>
            </div>
          ) : null}
          {isReset ? <p>We’ll send a secure reset link.</p> : null}
          {isSignUp && intentLabel && (!paidSignupPlan || planStatus === "ready") ? (
            <span className="wl-access-panel__intent">
              {intentLabel}
              {signupIntent?.preferredPlanId ? (
                <>
                  {" · "}
                  <Link to="/pricing">Change plan</Link>
                </>
              ) : null}
            </span>
          ) : null}
          {isSignUp && paidSignupPlan ? <p role="status">{notice}</p> : null}
        </header>

        {!isReset ? (
          <div className="wl-access-panel__tabs" role="group" aria-label="Account access mode">
            <button
              type="button"
              aria-pressed={!isSignUp}
              disabled={disabled}
              onClick={() => changeMode("signin")}
            >
              Sign In
            </button>
            <button
              type="button"
              aria-pressed={isSignUp}
              disabled={disabled}
              onClick={() => changeMode("signup")}
            >
              Create Account
            </button>
          </div>
        ) : null}

        {isSignUp ? (
          <div className="wl-access-panel__terms">
            <Checkbox
              ref={termsRef}
              id={termsId}
              name="termsAccepted"
              checked={agreedToTerms}
              disabled={disabled}
              required
              aria-labelledby={termsLabelId}
              aria-invalid={error === TERMS_CONSENT_ERROR}
              aria-describedby={error === TERMS_CONSENT_ERROR ? termsErrorId : undefined}
              onChange={(event) => {
                setAgreedToTerms(event.target.checked);
                if (event.target.checked && error === TERMS_CONSENT_ERROR) setError(null);
              }}
            />
            <label id={termsLabelId} htmlFor={termsId} className="wl-preserve-case cursor-pointer">
              I agree to the{" "}
              <Link to="/terms" target="_blank" rel="noopener">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" target="_blank" rel="noopener">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
        ) : null}

        {!isReset && oauthProviders.length > 0 ? (
          <div className="wl-access-panel__oauth" role="group" aria-label="Sign in options">
            {oauthProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="wl-preserve-case"
                disabled={disabled}
                onClick={() => startOAuth(provider.id)}
                aria-label={`Continue with ${provider.label}`}
              >
                {oauthPending === provider.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  provider.mark
                )}
                <span>{provider.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!isReset && oauthProviders.length > 0 ? (
          <div className="wl-access-panel__divider">
            <span>or use email</span>
          </div>
        ) : null}

        <form className="wl-access-panel__form" onSubmit={handleAuth} noValidate>
          <div className="wl-access-panel__field-group">
            <label htmlFor={emailInputId}>Email</label>
            <div className="wl-access-panel__field">
              <Mail aria-hidden="true" />
              <input
                id={emailInputId}
                ref={emailRef}
                name="email"
                type="email"
                required
                autoComplete="email"
                spellCheck={false}
                disabled={disabled}
                aria-invalid={invalidField === "email"}
                aria-describedby={invalidField === "email" ? emailErrorId : undefined}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (invalidField === "email") {
                    setInvalidField(null);
                    setError(null);
                  }
                }}
                placeholder="you@example.com"
              />
            </div>
          </div>

          {!isReset ? (
            <div className="wl-access-panel__field-group">
              <label htmlFor={passwordInputId}>Password</label>
              <div className="wl-access-panel__field">
                <Lock aria-hidden="true" />
                <input
                  id={passwordInputId}
                  ref={passwordRef}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  minLength={isSignUp ? 8 : undefined}
                  disabled={disabled}
                  aria-invalid={invalidField === "password"}
                  aria-describedby={
                    [
                      isSignUp && password ? passwordRulesId : null,
                      invalidField === "password" ? passwordErrorId : null,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (invalidField === "password") {
                      setInvalidField(null);
                      setError(null);
                    }
                  }}
                  placeholder={isSignUp ? "Create a password" : "Password"}
                />
                <button
                  type="button"
                  className="wl-access-panel__reveal"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={disabled}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              {!isSignUp ? (
                <button
                  type="button"
                  className="wl-access-panel__forgot"
                  disabled={disabled}
                  onClick={() => changeMode("reset")}
                >
                  Forgot?
                </button>
              ) : null}
              {isSignUp && password ? (
                <ul
                  id={passwordRulesId}
                  className="wl-access-panel__password-rules"
                  aria-label="Password requirements"
                >
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(password);
                    return (
                      <li key={rule.label} data-met={met ? "true" : "false"}>
                        {rule.label}
                        <span className="sr-only"> ({met ? "met" : "not met"})</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          {isReset ? (
            <button
              type="button"
              className="wl-access-panel__back"
              disabled={disabled}
              onClick={() => changeMode("signin")}
            >
              <ArrowLeft aria-hidden="true" /> Back to Sign In
            </button>
          ) : null}

          {error ? (
            <StatusNotice id={errorId} tone="destructive" title={error}>
              {isSignUp && /already exists/i.test(error) ? (
                <button type="button" disabled={disabled} onClick={() => changeMode("signin")}>
                  Sign In Instead
                </button>
              ) : null}
            </StatusNotice>
          ) : null}
          {message ? <StatusNotice tone="success" title={message} /> : null}
          {verificationNotice && !isReset ? (
            <StatusNotice tone={verificationNotice.tone} title={verificationNotice.title}>
              {verificationNotice.message}
            </StatusNotice>
          ) : null}

          <button type="submit" className="wl-access-panel__submit" disabled={disabled}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            <span>
              {loading
                ? "Working…"
                : isReset
                  ? "Send Reset Link"
                  : isSignUp
                    ? "Create Account"
                    : "Sign In"}
            </span>
            {!loading ? <ArrowRight aria-hidden="true" /> : null}
          </button>
        </form>
      </div>

      {!embedded ? (
        <nav className="wl-access-panel__links" aria-label="Public links">
          <Link to="/">Home</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/support">Support</Link>
        </nav>
      ) : null}
    </section>
  );
}
