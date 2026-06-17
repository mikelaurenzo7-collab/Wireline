import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Lock, Mail } from "lucide-react";

import { useAuth } from "./contexts/AuthContext";
import { getStoredSignupIntent, syncSignupIntent } from "./lib/signup-intent";

type AuthMode = "signin" | "signup" | "reset";
type OAuthProvider = "google" | "microsoft" | "yahoo";

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl tracking-tight", light ? "text-paper" : "text-ink")}>
      <span className="flex h-7 w-7 items-center justify-center bg-brand text-[12px] text-paper">W</span>
      Wireline
    </span>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 border border-brand bg-brand/8 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-brand", className)}>
      {children}
    </span>
  );
}

function cleanServerError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  for (const candidate of [data.error, data.message, (data.error as { message?: unknown })?.message]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const providers: Array<{ id: OAuthProvider; label: string; sub: string; mark: ReactNode }> = [
  { id: "google", label: "Google", sub: "Gmail and Google Workspace", mark: <span className="font-semibold text-brand">G</span> },
  {
    id: "microsoft",
    label: "Microsoft / Outlook",
    sub: "Outlook and Microsoft 365",
    mark: (
      <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
        <span className="block h-2 w-2 bg-brand" />
        <span className="block h-2 w-2 bg-brand/70" />
        <span className="block h-2 w-2 bg-brand/50" />
        <span className="block h-2 w-2 bg-brand/30" />
      </span>
    ),
  },
  { id: "yahoo", label: "Yahoo", sub: "Yahoo Mail", mark: <span className="font-semibold text-brand">Y</span> },
];

function OAuthButtons({ disabled, onError }: { disabled?: boolean; onError: (message: string | null) => void }) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const start = async (provider: OAuthProvider) => {
    if (disabled || pending) return;
    setPending(provider);
    onError(null);
    try {
      const res = await fetch(`/api/auth/${provider}/url`, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(cleanServerError(data) || `Could not start ${provider} sign-in.`);
      const url = data.url;
      if (typeof url !== "string" || !url.startsWith("http")) {
        throw new Error("Received an invalid sign-in URL from Wireline.");
      }
      window.location.assign(url);
    } catch (error) {
      const label = providers.find((p) => p.id === provider)?.label ?? provider;
      onError(`${label} sign-in failed: ${error instanceof Error ? error.message : "Please try again."}`);
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => start(provider.id)}
            disabled={disabled || !!pending}
            className="group flex min-h-[52px] w-full items-center justify-between border border-border bg-card px-4 text-left transition-all hover:border-brand hover:bg-background disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center border border-border bg-background text-sm">
                {pending === provider.id ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : provider.mark}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Continue with {provider.label}</span>
                <span className="block text-xs text-muted-foreground">{provider.sub}</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>Email password</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex">
        <div className="absolute right-[-12rem] top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand/30 blur-3xl" />
        <div className="relative z-10"><Link to="/"><Logo light /></Link></div>
        <div className="relative z-10 max-w-xl">
          <Chip className="border-paper/20 bg-paper/5 text-paper/70">OAuth restored</Chip>
          <h1 className="mt-5 font-display text-5xl leading-tight tracking-tight">The new Wireline look, with the real login rails back underneath.</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/65">Google, Yahoo, and Microsoft/Outlook sign-in use the existing production OAuth endpoints while staying inside the Figma overhaul.</p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-px border border-paper/10 bg-paper/10 text-center">
          {[["Google", "Workspace"], ["Outlook", "Microsoft 365"], ["Yahoo", "Mail"]].map(([a, b]) => (
            <div key={a} className="bg-paper/[.03] p-4">
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

export default function FigmaAuthPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const initialMode: AuthMode = location.pathname === "/signup" || location.pathname === "/get-started" ? "signup" : "signin";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname === "/signup" || location.pathname === "/get-started") setMode("signup");
    else if (location.pathname === "/signin" || location.pathname === "/login" || location.pathname === "/auth") setMode("signin");
  }, [location.pathname]);

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setError("Email is required.");
    if (!isReset && !password) return setError("Password is required.");
    if (isSignup && !agreed) return setError("Accept the Terms and Privacy Policy to create your account.");

    setLoading(true);
    try {
      if (isReset) {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: trimmedEmail }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(cleanServerError(data) || "Password reset request failed.");
        setMessage(typeof data.message === "string" ? data.message : "If that email is registered, a reset link is on its way.");
      } else {
        const res = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(cleanServerError(data) || "Authentication failed.");
        const user = data.user as { id?: string; email?: string; full_name?: string; is_owner?: boolean } | undefined;
        if (!user?.id || !user.email) throw new Error("Authentication succeeded but user payload was missing.");
        await syncSignupIntent(getStoredSignupIntent()).catch(() => {});
        signIn({ user: { id: user.id, email: user.email, full_name: user.full_name, is_owner: user.is_owner } });
        navigate(isSignup ? "/app/business" : "/agents", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const title = isReset ? "Reset your password" : isSignup ? "Create your Wireline account" : "Sign in to Wireline";
  const subtitle = isReset ? "Enter your email and Wireline will send a secure reset link." : isSignup ? "Choose OAuth or email to start your personal or business workspace." : "Use OAuth or email to return to your workspace.";

  return (
    <Shell>
      <Link to="/" className="mb-8 inline-flex lg:hidden"><Logo /></Link>
      <Chip>{isReset ? "Account recovery" : "Wireline account"}</Chip>
      <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight text-ink">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

      {!isReset && (
        <div className="mt-7 grid grid-cols-2 gap-px border border-border bg-border p-1">
          <button type="button" onClick={() => setMode("signin")} className={cn("min-h-[44px] text-sm font-semibold transition", !isSignup ? "bg-brand text-paper" : "bg-card text-muted-foreground hover:text-ink")}>Sign in</button>
          <button type="button" onClick={() => setMode("signup")} className={cn("min-h-[44px] text-sm font-semibold transition", isSignup ? "bg-brand text-paper" : "bg-card text-muted-foreground hover:text-ink")}>Create account</button>
        </div>
      )}

      <section className="mt-4 border border-border bg-card p-5 shadow-[0_24px_80px_-56px_rgba(26,22,20,0.55)] sm:p-6">
        {!isReset && <OAuthButtons disabled={loading} onError={setError} />}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm font-semibold text-ink">
            <span>Email address</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className="h-12 w-full border border-border bg-background pl-10 pr-3 text-base outline-none transition placeholder:text-muted-foreground focus:border-brand" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
            </span>
          </label>
          {!isReset && (
            <label className="block space-y-2 text-sm font-semibold text-ink">
              <span className="flex items-center justify-between">
                <span>Password</span>
                {!isSignup && <button type="button" onClick={() => setMode("reset")} className="text-xs font-medium text-brand hover:underline">Forgot password?</button>}
              </span>
              <span className="relative block">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input className="h-12 w-full border border-border bg-background pl-10 pr-3 text-base outline-none transition placeholder:text-muted-foreground focus:border-brand" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isSignup ? "Create a secure password" : "Enter your password"} autoComplete={isSignup ? "new-password" : "current-password"} />
              </span>
            </label>
          )}
          {isSignup && (
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-brand" />
              <span>I agree to the <Link to="/terms" className="font-medium text-brand hover:underline">Terms</Link> and <Link to="/privacy" className="font-medium text-brand hover:underline">Privacy Policy</Link>.</span>
            </label>
          )}
          {isReset && <button type="button" onClick={() => setMode("signin")} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> Back to sign in</button>}
          {error && <div className="flex items-start gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
          {message && <div className="flex items-start gap-2 border border-brand/25 bg-brand/10 p-3 text-sm text-brand"><Check className="mt-0.5 h-4 w-4 shrink-0" /> {message}</div>}
          <button type="submit" disabled={loading || (isSignup && !agreed)} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 bg-brand px-5 text-base font-semibold text-paper transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-55">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : isReset ? <>Send reset link <ArrowRight className="h-4 w-4" /></> : isSignup ? <>Create account <ArrowRight className="h-4 w-4" /></> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      </section>
      <p className="mt-5 text-center text-sm text-muted-foreground">Need the product tour? <Link to="/showcase" className="text-brand hover:underline">View demos</Link></p>
    </Shell>
  );
}

export function FigmaOAuthComplete() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const params = new URLSearchParams(location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(errorParam);
      return;
    }
    const code = params.get("code");
    if (!code) {
      setError("Sign-in response was incomplete. Please try again.");
      return;
    }
    const complete = async () => {
      try {
        const res = await fetch("/api/auth/oauth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(cleanServerError(data) || "Sign-in link expired. Please try again.");
        const raw = (data.user ?? data) as { user_id?: string; id?: string; email?: string; name?: string; full_name?: string; is_owner?: boolean | string };
        const user = {
          id: raw.id ?? raw.user_id,
          email: raw.email,
          full_name: raw.full_name ?? raw.name,
          is_owner: raw.is_owner === true || raw.is_owner === "1",
        };
        if (!user.id || !user.email) throw new Error("Sign-in response was incomplete. Please try again.");
        await syncSignupIntent(getStoredSignupIntent()).catch(() => {});
        signIn({ user });
        navigate("/agents", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      }
    };
    void complete();
  }, [location.search, navigate, signIn]);

  return (
    <Shell>
      <Chip>{error ? "Sign-in failed" : "Completing sign-in"}</Chip>
      <h1 className="mt-5 font-display text-4xl text-ink">{error ? "We could not finish sign-in." : "Finishing OAuth sign-in."}</h1>
      <div className="mt-7 border border-border bg-card p-6 text-sm text-muted-foreground">
        {error ? (
          <>
            <div className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>
            <Link to="/signin" className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center bg-brand px-5 font-semibold text-paper">Back to sign in</Link>
          </>
        ) : (
          <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-brand" /> Just a moment…</div>
        )}
      </div>
    </Shell>
  );
}
