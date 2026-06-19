import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import { Building2, Check, User } from "lucide-react";

import {
  captureSignupIntentFromLocation,
  persistSignupIntent,
  recommendedPlanFromIntent,
  type SignupIntent,
} from "./lib/signup-intent";
import { wirelineClerkAppearance } from "./lib/clerk-appearance";
import { isClerkClientConfigured } from "./components/WirelineClerkProvider";

type WorkspaceMode = "personal" | "business";

const WORKSPACE_MODE_KEY = "wireline.mode";
const AUTH_REDIRECT_KEY = "wireline.auth.redirect";

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function workspaceFromIntent(intent: SignupIntent | null | undefined): WorkspaceMode {
  const plan = intent ? recommendedPlanFromIntent(intent) : null;
  return plan === "personal" || intent?.signupWedge === "personal" ? "personal" : "business";
}

function readStoredWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") return "business";
  const stored = window.localStorage.getItem(WORKSPACE_MODE_KEY);
  return stored === "personal" || stored === "business" ? stored : "business";
}

function persistWorkspaceMode(mode: WorkspaceMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_MODE_KEY, mode);
}

function isSafeInternalPath(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return !/^\/auth\b|^\/signin\b|^\/login\b|^\/signup\b|^\/get-started\b|^\/reset\b/.test(
    value,
  );
}

function readRedirectFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("redirect");
  return isSafeInternalPath(value) ? value : null;
}

function persistAuthRedirect(value: string | null) {
  if (typeof window === "undefined") return;
  if (isSafeInternalPath(value)) window.localStorage.setItem(AUTH_REDIRECT_KEY, value);
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-xl tracking-tight",
        light ? "text-paper" : "text-foreground",
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center bg-brand text-[12px] text-paper">
        W
      </span>
      Wireline
    </span>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
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

function Shell({ children, mode }: { children: ReactNode; mode: WorkspaceMode }) {
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex">
        <div className="absolute right-[-12rem] top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand/30 blur-3xl" />
        <div className="relative z-10">
          <Link to="/">
            <Logo light />
          </Link>
        </div>
        <div className="relative z-10 max-w-xl">
          <Chip className="border-paper/20 bg-card/5 text-paper/70">
            {mode === "personal" ? "Personal workspace" : "Business workspace"}
          </Chip>
          <h1 className="mt-5 font-display text-5xl leading-tight tracking-tight">
            {mode === "personal"
              ? "Your Personal Wireline Assistant."
              : "Your Business Wireline Assistants, in one place."}
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/65">
            {mode === "personal"
              ? "Screen calls, block spam, and keep your day moving — your assistant handles the phone so you don't have to."
              : "Set up AI voice, SMS, and email assistants with the tools, training, and approvals your team already uses."}
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-px border border-paper/10 bg-card/10 text-center">
          {[
            ["Google", "Sign in"],
            ["Apple", "Sign in"],
            ["Phone", "OTP"],
          ].map(([a, b]) => (
            <div key={a} className="bg-card/[.03] p-4">
              <div className="font-display text-xl">{a}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-paper/45">{b}</div>
            </div>
          ))}
        </div>
      </div>
      <main className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[460px]">{children}</div>
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
    <div className="grid gap-2">
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

function ClerkNotConfigured() {
  return (
    <div className="border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
      Clerk is not configured. Set <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> and{" "}
      <code className="font-mono">CLERK_SECRET_KEY</code> in your environment, then enable social
      providers in the Clerk dashboard.
    </div>
  );
}

export default function FigmaAuthPortal() {
  const location = useLocation();
  const capturedIntent = useMemo(
    () => captureSignupIntentFromLocation(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.search],
  );
  const isSignup =
    location.pathname === "/signup" ||
    location.pathname === "/get-started" ||
    location.pathname.startsWith("/signup/");
  const redirectTarget = useMemo(() => readRedirectFromSearch(location.search), [location.search]);
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>(() =>
    capturedIntent ? workspaceFromIntent(capturedIntent) : readStoredWorkspaceMode(),
  );

  const setWorkspaceMode = (next: WorkspaceMode) => {
    setWorkspaceModeState(next);
    persistWorkspaceMode(next);
    persistSignupIntent({
      capturedAt: new Date().toISOString(),
      preferredPlanId: next === "personal" ? "personal" : "starter",
      signupWedge: next === "personal" ? "personal" : undefined,
    });
  };

  useEffect(() => {
    persistWorkspaceMode(workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    persistAuthRedirect(redirectTarget);
  }, [redirectTarget]);

  const title = isSignup ? "Create your Wireline account" : "Sign in to Wireline";
  const subtitle = isSignup
    ? "Choose personal or business, then sign in with Google, Apple, phone, or email via Clerk."
    : redirectTarget
      ? "Sign in to continue where you left off."
      : "Secure sign-in with social, Apple, phone OTP, passkeys, and MFA.";

  const clerkRedirect = "/auth/clerk-complete";

  return (
    <Shell mode={workspaceMode}>
      <Link to="/" className="mb-8 inline-flex lg:hidden">
        <Logo />
      </Link>
      <Chip>Wireline account</Chip>
      <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      {redirectTarget && (
        <div className="mt-4 rounded-[16px] border border-brand/20 bg-brand/8 p-3 text-xs leading-5 text-brand">
          After sign-in, Wireline will return you to{" "}
          <span className="font-semibold">{redirectTarget}</span>.
        </div>
      )}

      <section className="mt-7 border border-border bg-card p-5 shadow-[0_24px_80px_-56px_rgba(30,27,46,0.55)] sm:p-6">
        {isSignup && (
          <div className="mb-5">
            <WorkspaceSelector mode={workspaceMode} setMode={setWorkspaceMode} />
          </div>
        )}

        {!isClerkClientConfigured() ? (
          <ClerkNotConfigured />
        ) : isSignup ? (
          <SignUp
            routing="path"
            path="/signup"
            signInUrl="/signin"
            forceRedirectUrl={clerkRedirect}
            fallbackRedirectUrl={clerkRedirect}
            appearance={wirelineClerkAppearance}
          />
        ) : (
          <SignIn
            routing="path"
            path="/signin"
            signUpUrl="/signup"
            forceRedirectUrl={clerkRedirect}
            fallbackRedirectUrl={clerkRedirect}
            appearance={wirelineClerkAppearance}
          />
        )}
      </section>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link to="/signin" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Wireline?{" "}
            <Link to="/signup" className="font-semibold text-brand hover:underline">
              Create account
            </Link>
          </>
        )}
      </p>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        Mailbox connections (Gmail, Outlook, Yahoo) are configured later on the{" "}
        <Link to="/app/business/integrations" className="text-brand hover:underline">
          Integrations
        </Link>{" "}
        page — separate from sign-in.
      </p>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Need the product tour?{" "}
        <Link to="/showcase" className="text-brand hover:underline">
          View demos
        </Link>
      </p>
    </Shell>
  );
}

/** @deprecated OAuth sign-in complete — Clerk uses /auth/clerk-complete */
export function FigmaOAuthComplete() {
  return null;
}
