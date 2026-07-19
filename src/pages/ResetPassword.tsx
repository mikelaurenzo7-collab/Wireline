/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import { getPasswordPolicyError } from "../lib/password-policy";
import { Button, Input } from "../components/atoms";
import { FormField, StatusNotice } from "../components/molecules";
import MarketingChrome from "../components/marketing/MarketingChrome";
import WirelineMark from "../components/WirelineMark";
import { readStoredWorkspaceMode, resolvePostAuthDestination } from "../lib/auth-redirect";

/**
 * /reset-password?token=<raw>
 *
 * Lands the user from the password-reset email. Reads the token from the URL,
 * validates the password locally, posts to /api/auth/reset-password, and
 * hydrates the authenticated client state when the server returns a user.
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      let data: any = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        const message =
          data?.error ||
          (response.status >= 500
            ? "Server temporarily unavailable. Please try again shortly."
            : "Reset failed");
        throw new Error(message);
      }

      setSuccess(true);
      if (data.user) {
        signIn({ user: data.user });
        const destination = resolvePostAuthDestination(
          readStoredWorkspaceMode() || "personal",
          window.location.search,
        );
        window.setTimeout(() => navigate(destination, { replace: true }), 900);
      }
    } catch (caughtError: any) {
      setError(caughtError.message || "Reset failed");
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
      <div className="flex flex-1 items-center justify-center px-4 py-8 pt-20 sm:pt-24">
        <div className="w-full max-w-[420px] wl-auth-card rounded-md p-6 sm:p-8">
          <div className="wl-auth-card-header mb-6">
            <div className="wl-auth-brand-chip" aria-hidden="true">
              <WirelineMark className="w-5 h-5" stroke="white" strokeWidth={10} />
            </div>
            <div>
              <h1 className="font-display italic text-2xl sm:text-3xl text-foreground leading-tight">
                Reset password
              </h1>
              <p className="text-caption mt-1.5">
                Choose a new password for your Wireline account.
              </p>
            </div>
          </div>

          {success ? (
            <StatusNotice tone="success" title="Password updated">
              Signing you in securely…
            </StatusNotice>
          ) : !token ? (
            <StatusNotice tone="destructive" title="This reset link is incomplete">
              Request a new one from the{" "}
              <Link to="/signin" className="font-medium text-brand underline underline-offset-4">
                sign-in page
              </Link>
              .
            </StatusNotice>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted/80 mb-6 leading-relaxed">
                Pick a new password to finish resetting your Wireline account. Use at least 8
                characters with uppercase, lowercase, and a number.
              </p>

              <FormField label="New password" htmlFor="reset-password" required>
                <Input
                  id="reset-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="auth-input tracking-[0.32em]"
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                />
              </FormField>

              <FormField label="Confirm new password" htmlFor="reset-password-confirm" required>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="auth-input tracking-[0.32em]"
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                />
              </FormField>

              {error ? (
                <StatusNotice tone="destructive" title="Password reset was not completed">
                  {error}
                </StatusNotice>
              ) : null}

              <Button
                type="submit"
                disableAnimations
                variant="editorial"
                disabled={loading || !password || password !== confirm}
                className="w-full px-5 py-3.5 min-h-[48px] rounded-md text-sm font-medium"
              >
                {loading ? "Updating…" : "Reset password"}
              </Button>

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
