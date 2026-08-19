import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../../contexts/AuthContext";
import { resolvePostAuthDestination } from "../../lib/auth-redirect";
import { markFreshSignupSession } from "../../lib/post-signup-onboarding";
import { captureSignupIntentFromLocation } from "../../lib/signup-intent";
import { isAllowedOAuthUrl } from "../../lib/oauth-url";
import { WirelineLockup } from "../brand/WirelineBrand";

const PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
  { id: "yahoo", label: "Yahoo" },
] as const;

type Provider = (typeof PROVIDERS)[number]["id"];

export default function LandingAuthPanel() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Provider | "email" | null>(null);
  const [error, setError] = useState("");

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setPending("email");
    setError("");
    try {
      await signIn(email.trim(), password);
      navigate(resolvePostAuthDestination({}));
    } catch {
      setError("Could not sign in. Check your email and password, then try again.");
    } finally {
      setPending(null);
    }
  };

  const startOAuth = async (provider: Provider) => {
    if (pending) return;
    setPending(provider);
    setError("");
    try {
      const response = await fetch(`/api/auth/${provider}/url`, {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !isAllowedOAuthUrl(payload?.url)) {
        throw new Error("oauth unavailable");
      }
      window.location.assign(payload.url);
    } catch {
      setPending(null);
      setError(`${provider[0].toUpperCase()}${provider.slice(1)} sign-in is unavailable right now.`);
    }
  };

  const startFree = () => {
    captureSignupIntentFromLocation();
    markFreshSignupSession();
  };

  return (
    <section className="landing-auth" aria-labelledby="landing-auth-title">
      <div className="landing-auth__brand">
        <WirelineLockup size="standard" />
      </div>
      <div className="landing-auth__intro">
        <p className="landing-auth__kicker">ENTER WIRELINE</p>
        <h2 id="landing-auth-title">Your next Bot is one sign-in away.</h2>
        <p>Sign in, or start free and build one in minutes.</p>
      </div>

      <div className="landing-auth__providers" aria-label="Sign in with provider">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="landing-auth__provider"
            disabled={Boolean(pending)}
            onClick={() => startOAuth(provider.id)}
          >
            {pending === provider.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            <span>Continue with {provider.label}</span>
          </button>
        ))}
      </div>

      <div className="landing-auth__divider"><span>or</span></div>

      <form className="landing-auth__form" onSubmit={submitEmail}>
        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
          />
        </label>
        {error ? <p className="landing-auth__error" role="alert">{error}</p> : null}
        <button type="submit" className="landing-auth__submit" disabled={pending === "email"}>
          {pending === "email" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          <span>Sign In</span>
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </form>

      <div className="landing-auth__footer">
        <Link to="/signup?plan=personal" onClick={startFree}>Start free</Link>
        <Link to="/reset-password">Forgot password?</Link>
      </div>
    </section>
  );
}
