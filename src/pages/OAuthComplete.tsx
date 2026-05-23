/**
 * /auth/oauth-complete — bridge page between the server-side OAuth
 * callback and the client-side AuthContext.
 *
 * The flow:
 *   1. /api/auth/{google,microsoft}/callback validates the OAuth code,
 *      issues a Wireline JWT, and 302-redirects the browser here with
 *      ?token=…&user_id=…&email=…&name=…&error=… in the query string.
 *   2. This page reads those params, calls AuthContext.signIn() to
 *      persist into localStorage, and navigates to /.
 *   3. On error, shows the message + a "Back to sign in" link.
 *
 * The URL is cleaned via `navigate("/", { replace: true })` so a
 * back-button won't replay the OAuth token.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import WirelineMark from "../components/WirelineMark";

export default function OAuthComplete() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  // The handshake must run exactly once. signIn() updates AuthContext,
  // which re-renders this component — without this guard the effect
  // re-fires on every render and the page thrashes instead of
  // redirecting (the "Completing sign-in… stuck forever" bug).
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
    const token = params.get("token");
    const userId = params.get("user_id");
    const email = params.get("email");
    const name = params.get("name");
    if (!token || !userId || !email) {
      setError("Sign-in response was incomplete. Please try again.");
      return;
    }
    signIn({
      access_token: token,
      user: {
        id: userId,
        email,
        full_name: name || undefined,
        // Server stamps "1" when the email matches OWNER_EMAIL — gates
        // the Founder's Dashboard for owners who sign in via OAuth.
        is_owner: params.get("is_owner") === "1",
      },
    });
    // Replace so a back button doesn't re-trigger the bridge.
    navigate("/", { replace: true });
  }, [location.search, signIn, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-3xl glass-strong border border-white/10 p-8 text-center space-y-5">
        <div className="flex justify-center">
          <WirelineMark className="w-12 h-12 rounded-2xl" />
        </div>
        {error ? (
          <>
            <div role="alert" className="flex items-center justify-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-[0.4em] font-medium">
                Sign-in failed
              </span>
            </div>
            <p className="text-sm text-ink/80 leading-relaxed">{error}</p>
            <a
              href="/"
              className="inline-block text-[10px] uppercase tracking-[0.3em] text-brand hover:opacity-80 transition-opacity"
            >
              ← Back to sign in
            </a>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-brand">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[10px] uppercase tracking-[0.4em] font-medium">
                Completing sign-in
              </span>
            </div>
            <p className="text-sm text-ink/70">Just a moment…</p>
          </>
        )}
      </div>
    </div>
  );
}
