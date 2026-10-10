/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";
import { getPasswordPolicyError } from "../lib/password-policy";
import { Button, Input } from "../components/atoms";
import { FormField, StatusNotice } from "../components/molecules";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { WirelineLockup, WirelineWordmark } from "../components/brand/WirelineBrand";
import { readStoredWorkspaceMode, resolvePostAuthDestination } from "../lib/auth-redirect";

function readResetTokenFromLocation(): string {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  // New reset emails use the fragment so the bearer credential never reaches
  // the server. Query support keeps already-issued reset emails working.
  return hash.get("token") || query.get("token") || "";
}

/**
 * /reset-password#token=<raw>
 *
 * Lands the user from the password-reset email. Captures the single-use token
 * synchronously, removes it from browser-visible history before paint, validates
 * the password locally, posts to /api/auth/reset-password, and hydrates the
 * authenticated client state when the server returns a user.
 */
export default function ResetPassword() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const resetTokenRef = useRef(readResetTokenFromLocation());
  const [token] = useState<string | null>(() => resetTokenRef.current || null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [invalidField, setInvalidField] = useState<"password" | "confirm" | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [signInRecovery, setSignInRecovery] = useState(false);
  const resetAttemptClosed = useRef(false);

  useLayoutEffect(() => {
    if (!window.location.search && !window.location.hash) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || resetAttemptClosed.current) return;
    setError(null);
    setInvalidField(null);

    if (!token) {
      setError("This reset link is missing its token. Request a new one from the sign-in page.");
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      setInvalidField("password");
      passwordRef.current?.focus();
      return;
    }

    if (password !== confirm) {
      setError("Passwords don't match.");
      setInvalidField("confirm");
      confirmRef.current?.focus();
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

      // A successful HTTP response may already have consumed this single-use
      // token, even when its body cannot confirm the new session.
      resetAttemptClosed.current = true;
      if (
        typeof data?.user?.id !== "string" ||
        !data.user.id.trim() ||
        typeof data.user.email !== "string" ||
        !data.user.email.trim()
      ) {
        setSignInRecovery(true);
        return;
      }

      signIn({ user: data.user });
      const destination = resolvePostAuthDestination(
        readStoredWorkspaceMode() || "personal",
        window.location.search,
      );
      setSuccess(true);
      window.setTimeout(() => navigate(destination, { replace: true }), 900);
    } catch (caughtError: any) {
      if (resetAttemptClosed.current) setSignInRecovery(true);
      else setError(caughtError.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketingChrome stickyCta={false} footer={false} authCanvas>
      <PageMeta
        title="Reset Password | BotBound"
        description="Reset your BotBound account password."
        path="/reset-password"
        noIndex
      />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[420px] wl-auth-card rounded-md p-6 sm:p-8">
          <div className="wl-auth-card-header mb-6">
            <WirelineLockup size="compact" surface="tile" />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl text-foreground leading-tight">
                Reset Password
              </h1>
              <p className="text-caption mt-1.5">
                Secure your <WirelineWordmark inline /> account.
              </p>
            </div>
          </div>

          {success ? (
            <StatusNotice tone="success" title="Password Updated">
              Signing you in securely…
            </StatusNotice>
          ) : signInRecovery ? (
            <StatusNotice tone="warning" title="Sign In to Continue">
              <p>
                The response was incomplete. Try your new password at sign-in, or request a new
                reset link there.
              </p>
              <Link
                to="/signin"
                className="marketing-btn-secondary mt-4 inline-flex min-h-11 items-center justify-center px-4"
              >
                Sign In
              </Link>
            </StatusNotice>
          ) : !token ? (
            <StatusNotice tone="destructive" title="This Reset Link Is Incomplete">
              Request a new one from the{" "}
              <Link to="/signin" className="font-medium text-brand underline underline-offset-4">
                sign-in page
              </Link>
              .
            </StatusNotice>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted/80 mb-6 leading-relaxed">
                Pick a new password to finish resetting your <WirelineWordmark inline /> account.
                Use at least 8 characters with uppercase, lowercase, and a number.
              </p>

              <FormField
                label="New password"
                htmlFor="reset-password"
                required
                error={invalidField === "password" ? error : undefined}
              >
                <Input
                  ref={passwordRef}
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  disabled={loading}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (invalidField) {
                      setInvalidField(null);
                      setError(null);
                    }
                  }}
                  className={`auth-input ${showPassword ? "" : "tracking-[0.32em]"}`}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                />
              </FormField>

              <FormField
                label="Confirm new password"
                htmlFor="reset-password-confirm"
                required
                error={invalidField === "confirm" ? error : undefined}
              >
                <Input
                  ref={confirmRef}
                  id="reset-password-confirm"
                  type={showPassword ? "text" : "password"}
                  disabled={loading}
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(event) => {
                    setConfirm(event.target.value);
                    if (invalidField === "confirm") {
                      setInvalidField(null);
                      setError(null);
                    }
                  }}
                  className={`auth-input ${showPassword ? "" : "tracking-[0.32em]"}`}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                />
              </FormField>

              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                className="min-h-11 gap-2 text-sm text-muted-foreground"
              >
                {showPassword ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
                {showPassword ? "Hide passwords" : "Show passwords"}
              </Button>

              {error && !invalidField ? (
                <StatusNotice tone="destructive" title="Password Reset Was Not Completed">
                  {error}
                </StatusNotice>
              ) : null}

              <Button
                type="submit"
                disableAnimations
                variant="editorial"
                disabled={loading}
                className="w-full px-5 py-3.5 min-h-[48px] rounded-md text-sm font-medium"
              >
                {loading ? "Updating…" : "Reset Password"}
              </Button>

              <div className="text-center pt-2">
                <Link to="/signin" className="text-caption font-medium text-brand hover:underline">
                  ← Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </MarketingChrome>
  );
}
