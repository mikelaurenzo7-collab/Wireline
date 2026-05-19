import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, AlertTriangle, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import WirelineMark from "../components/WirelineMark";

/**
 * /reset-password?token=<raw>
 *
 * Lands the user from the password-reset email. Reads the token from
 * the URL, takes a new password, posts to /api/auth/reset-password,
 * and (on success) signs the user in via the returned JWT and routes
 * to the dashboard. Mirrors AuthPortal's visual style and password
 * minimum-length rule (8 chars) so the experience feels continuous.
 *
 * The page must render even when the user is unauthenticated, so
 * App.tsx routes to this BEFORE the auth guard. We don't navigate
 * away when the user already has a session — they might still want
 * to reset on a shared device.
 */
export default function ResetPassword() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("token");
    setToken(raw && raw.length > 0 ? raw : null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token. Request a new one from the sign-in page.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setSuccess(true);

      if (data.token && data.user) {
        // Backend returns a fresh JWT — sign the user straight in and
        // route to the dashboard. The brief "Password updated"
        // confirmation animates for ~1s before the redirect so the
        // success state isn't ambiguous.
        signIn({ access_token: data.token, user: data.user });
        setTimeout(() => navigate("/", { replace: true }), 900);
      }
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-paper">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[25%] -left-[15%] w-[70vw] h-[70vw] max-w-[640px] max-h-[640px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.16), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[20%] -right-[15%] w-[65vw] h-[65vw] max-w-[600px] max-h-[600px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.16), transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md p-6 sm:p-8 mx-4">
        <div className="flex items-center gap-3 mb-10">
          <div
            className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "#4F1E7B",
              boxShadow:
                "0 8px 24px -8px rgba(79, 30, 123 ,0.60), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <WirelineMark className="w-5 h-5 text-paper" strokeWidth={130} />
          </div>
          <div>
            <span className="brand-wordmark text-2xl leading-none">WIRELINE</span>
            <p className="text-[8px] tracking-[0.42em] uppercase text-muted mt-0.5">
              Reset password
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-3 text-emerald-500">
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">Password updated. Signing you in…</span>
            </div>
          </div>
        ) : !token ? (
          <div className="space-y-4 p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30">
            <div className="flex items-start gap-3 text-rose-500">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm leading-relaxed">
                This reset link is missing its token. Request a new one from the{" "}
                <a href="/" className="underline">
                  sign-in page
                </a>
                .
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted/80 mb-6 leading-relaxed">
              Pick a new password to finish resetting your Wireline account. It must be at least 8
              characters.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-brand" />
                New password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input tracking-[0.32em]"
                placeholder="••••••••••••"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.4em] text-muted/80 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-brand" />
                Confirm new password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="auth-input tracking-[0.32em]"
                placeholder="••••••••••••"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password || password !== confirm}
              className="w-full px-5 py-3.5 min-h-[48px] rounded-xl text-sm font-medium text-paper transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99]"
              style={{
                background: "#4F1E7B",
                boxShadow: "0 8px 24px -8px rgba(79, 30, 123 ,0.50)",
              }}
            >
              {loading ? "Updating…" : "Reset password"}
            </button>

            <div className="text-center pt-2">
              <a
                href="/"
                className="text-[10px] uppercase tracking-[0.3em] text-muted/60 hover:text-brand transition-colors"
              >
                ← Back to sign in
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
