/**
 * /auth/oauth-complete — bridge page between the server-side OAuth
 * callback and the client-side AuthContext.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getStoredSignupIntent, syncSignupIntent } from "../lib/signup-intent";
import { readStoredWorkspaceMode, resolvePostAuthDestination } from "../lib/auth-redirect";
import MarketingChrome from "../components/marketing/MarketingChrome";
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
    <MarketingChrome stickyCta={false} footer={false}>
      <PageMeta
        title="Completing sign-in — Wireline"
        description="Finishing your Wireline sign-in."
        path="/auth/oauth-complete"
        noIndex
      />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md border border-border bg-card/92 p-7 sm:p-8 text-center space-y-5 wl-oauth-complete-card">
          {error ? (
            <>
              <div role="alert" className="flex items-center justify-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h1 className="text-eyebrow text-rose-600">Sign-in failed</h1>
              </div>
              <p className="text-caption leading-relaxed">{error}</p>
              <Link to="/signin" className="marketing-btn-secondary w-full min-h-[48px]">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 text-brand">
                <Loader2 className="w-5 h-5 animate-spin" />
                <h1 className="text-eyebrow text-brand">Completing sign-in</h1>
              </div>
              <p className="text-caption">Just a moment…</p>
            </>
          )}
        </div>
      </div>
    </MarketingChrome>
  );
}
