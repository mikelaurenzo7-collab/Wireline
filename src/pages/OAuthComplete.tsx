/**
 * /auth/oauth-complete — bridge page between the server-side OAuth
 * callback and the client-side AuthContext.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getStoredSignupIntent, syncSignupIntent } from "../lib/signup-intent";
import { readStoredWorkspaceMode, resolvePostAuthDestination } from "../lib/auth-redirect";
import MarketingChrome from "../components/marketing/MarketingChrome";
import WirelineMark from "../components/brand/WirelineMark";
import { PageMeta } from "../lib/page-meta";
import { sanitizeOAuthSignInError } from "../lib/oauth-public-error";

function readCompletionParams(search: string, hash: string): URLSearchParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  for (const key of ["code", "error"] as const) {
    const value = fragment.get(key);
    if (value) params.set(key, value);
  }
  return params;
}

export default function OAuthComplete() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);
  const completionParamsRef = useRef<URLSearchParams | null>(null);

  useLayoutEffect(() => {
    completionParamsRef.current = readCompletionParams(location.search, location.hash);
    if (location.search || location.hash) {
      window.history.replaceState(window.history.state, "", location.pathname);
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const params =
      completionParamsRef.current ?? readCompletionParams(location.search, location.hash);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(sanitizeOAuthSignInError(errorParam));
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
        if (!res.ok) {
          setError("Sign-in link expired. Please try again.");
          return;
        }
        const data = await res.json();
        const user = data.user ?? {
          id: data.user_id,
          email: data.email,
          full_name: data.name || undefined,
          is_owner: data.is_owner === "1",
        };
        if (!user?.id || !user?.email) {
          setError("Sign-in response was incomplete. Please try again.");
          return;
        }
        await syncSignupIntent(getStoredSignupIntent()).catch(() => {});
        signIn({ user });
        // Redirect intent is persisted before OAuth begins; never carry bridge secrets forward.
        navigate(resolvePostAuthDestination(readStoredWorkspaceMode(), ""), {
          replace: true,
        });
      } catch {
        setError("Sign-in failed. Please try again.");
      }
    };
    void complete();
  }, [location.hash, location.search, signIn, navigate]);

  return (
    <MarketingChrome stickyCta={false} footer={false} authCanvas>
      <PageMeta
        title="Completing sign-in | Wireline"
        description="Finishing your Wireline sign-in."
        path="/auth/oauth-complete"
        noIndex
      />
      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-4 py-8 pt-20 sm:pt-24"
      >
        <section
          className="wl-auth-card w-full max-w-[420px] rounded-md p-6 text-center sm:p-8"
          aria-live="polite"
          aria-busy={!error}
        >
          <div className="flex justify-center">
            <div className="wl-auth-brand-chip" aria-hidden="true">
              <WirelineMark className="size-8 text-white" />
            </div>
          </div>

          <div className="mt-7 flex justify-center" aria-hidden="true">
            {error ? (
              <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </span>
            ) : (
              <span className="grid size-11 place-items-center rounded-full bg-brand/10 text-brand">
                <Loader2 className="size-5 animate-spin" />
              </span>
            )}
          </div>

          <h1 className="mt-4 font-display text-2xl leading-[1.05] tracking-[-.025em] text-foreground sm:text-3xl">
            {error ? "Sign-in failed" : "Completing sign-in"}
          </h1>
          <p
            role={error ? "alert" : undefined}
            className="mt-3 text-caption leading-relaxed text-muted-foreground"
          >
            {error || "Securing your session and opening your workspace."}
          </p>

          {error ? (
            <Link
              to="/signin"
              className="marketing-btn-secondary mt-7 inline-flex min-h-12 w-full items-center justify-center"
            >
              Back to sign in
            </Link>
          ) : null}
        </section>
      </main>
    </MarketingChrome>
  );
}
