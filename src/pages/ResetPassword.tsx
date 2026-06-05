/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, AlertTriangle, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import { getPasswordPolicyError } from "../lib/password-policy";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { Input } from "../components/ui/shadcn/Input";
import { ShadButton } from "../components/ui/shadcn/ShadButton";

/**
 * /reset-password?token=<raw>
 *
 * Lands the user from the password-reset email. Reads the token from
 * the URL, takes a new password, posts to /api/auth/reset-password,
 * and (on success) signs the user in via the returned JWT and routes
 * to the dashboard. Mirrors AuthPortal's visual style and password
 * policy so the experience feels continuous.
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
    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
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
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          data?.error ||
          (res.status >= 500
            ? "Server temporarily unavailable. Please try again shortly."
            : "Reset failed");
        throw new Error(msg);
      }

      setSuccess(true);

      if (data.user) {
        // Session cookie is set by the server — hydrate client state and
        // route to the dashboard. The brief "Password updated"
        // confirmation animates for ~1s before the redirect so the
        // success state isn't ambiguous.
        signIn({ user: data.user });
        setTimeout(() => navigate("/", { replace: true }), 900);
      }
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketingChrome stickyCta={false} footer={false} authCanvas>
      <PageMeta
        title="Reset Password"
        description="Reset your Wireline account password."
        path="/reset-password"
        noIndex
      />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-md border border-black/8 bg-[#FAF8F5] p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="font-display italic text-2xl sm:text-3xl text-ink leading-tight">
              Reset password
            </h1>
            <p className="text-caption mt-1.5">Choose a new password for your operator account.</p>
          </div>

          {success ? (
            <div className="space-y-4 p-6 rounded-md wl-status-success border">
              <div className="flex items-center gap-3 wl-text-success">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Password updated. Signing you in…</span>
              </div>
            </div>
          ) : !token ? (
            <div className="space-y-4 p-6 rounded-md bg-rose-500/10 border border-rose-500/30">
              <div className="flex items-start gap-3 text-rose-500">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm leading-relaxed">
                  This reset link is missing its token. Request a new one from the{" "}
                  <Link to="/signin" className="underline text-brand">
                    sign-in page
                  </Link>
                  .
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted/80 mb-6 leading-relaxed">
                Pick a new password to finish resetting your Wireline account. Use at least 8
                characters with uppercase, lowercase, and a number.
              </p>

              <div className="space-y-2">
                <label className="app-section-title/80 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-brand" />
                  New password
                </label>
                <Input
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
                <label className="app-section-title/80 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-brand" />
                  Confirm new password
                </label>
                <Input
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
                <div
                  role="alert"
                  className="flex items-start gap-3 p-4 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              <ShadButton
                type="submit"
                disableAnimations
                variant="editorial"
                disabled={loading || !password || password !== confirm}
                className="w-full px-5 py-3.5 min-h-[48px] rounded-md text-sm font-medium"
              >
                {loading ? "Updating…" : "Reset password"}
              </ShadButton>

              <div className="text-center pt-2">
                <Link to="/signin" className="text-caption font-medium text-brand hover:underline">
                  ← Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </MarketingChrome>
  );
}
