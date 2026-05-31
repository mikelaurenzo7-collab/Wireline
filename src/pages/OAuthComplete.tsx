/**
 * /auth/oauth-complete — bridge page between the server-side OAuth
 * callback and the client-side AuthContext.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getStoredSignupIntent, syncSignupIntent } from "../lib/signup-intent";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

export default function OAuthComplete() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

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
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          setError("Sign-in link expired. Please try again.");
          return;
        }
        const data = await res.json();
        if (!data.token || !data.user_id || !data.email) {
          setError("Sign-in response was incomplete. Please try again.");
          return;
        }
        await syncSignupIntent(getStoredSignupIntent(), data.token).catch(() => {});
        signIn({
          access_token: data.token,
          user: {
            id: data.user_id,
            email: data.email,
            full_name: data.name || undefined,
            is_owner: data.is_owner === "1",
          },
        });
        navigate("/chat", { replace: true });
      } catch {
        setError("Sign-in failed. Please try again.");
      }
    };
    void complete();
  }, [location.search, signIn, navigate]);

  return (
    <MarketingChrome stickyCta={false} footer={false}>
      <PageMeta
        title="Completing sign-in — Wireline"
        description="Finishing your Wireline sign-in."
        path="/auth/oauth-complete"
        noIndex
      />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div
          className="w-full max-w-sm rounded-2xl border border-black/8 bg-[#FAF8F5] p-8 text-center space-y-5"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.9) inset, 0 20px 50px -24px rgba(107, 43, 153, 0.2)",
          }}
        >
          {error ? (
            <>
              <div
                role="alert"
                className="flex items-center justify-center gap-2"
                style={{ color: "#E8466A" }}
              >
                <AlertTriangle className="w-5 h-5" />
                <span className="text-eyebrow">Sign-in failed</span>
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
                <span className="text-eyebrow text-brand">Completing sign-in</span>
              </div>
              <p className="text-caption">Just a moment…</p>
            </>
          )}
        </div>
      </div>
    </MarketingChrome>
  );
}
