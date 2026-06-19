import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { syncSignupIntent, getStoredSignupIntent } from "../lib/signup-intent";
import { BRAND } from "../constants/brand-colors";

const WORKSPACE_MODE_KEY = "wireline.mode";
const AUTH_REDIRECT_KEY = "wireline.auth.redirect";

function readStoredWorkspaceMode(): "personal" | "business" {
  if (typeof window === "undefined") return "business";
  const stored = window.localStorage.getItem(WORKSPACE_MODE_KEY);
  return stored === "personal" ? "personal" : "business";
}

function isSafeInternalPath(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return !/^\/auth\b|^\/signin\b|^\/login\b|^\/signup\b|^\/get-started\b|^\/reset\b/.test(
    value,
  );
}

function consumeAuthRedirect() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_REDIRECT_KEY);
  window.localStorage.removeItem(AUTH_REDIRECT_KEY);
  return isSafeInternalPath(value) ? value : null;
}

function targetFor(mode: "personal" | "business") {
  return mode === "personal" ? "/app/personal" : "/app/business";
}

function targetAfterAuth(mode: "personal" | "business") {
  return consumeAuthRedirect() ?? targetFor(mode);
}

function cleanServerError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  for (const candidate of [data.error, data.message]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

export default function ClerkAuthComplete() {
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceMode = readStoredWorkspaceMode();

  useEffect(() => {
    if (!isLoaded || handledRef.current) return;
    if (!isSignedIn) {
      navigate("/signin", { replace: true });
      return;
    }

    handledRef.current = true;
    const complete = async () => {
      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          throw new Error("Clerk session was missing. Please sign in again.");
        }

        const res = await fetch("/api/auth/clerk/bridge", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkToken}`,
            Accept: "application/json",
          },
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(cleanServerError(data) || "Could not finish sign-in. Please try again.");
        }

        const user = data.user as
          | {
              id?: string;
              email?: string;
              full_name?: string | null;
              is_owner?: boolean;
            }
          | undefined;
        if (!user?.id || !user.email) {
          throw new Error("Sign-in succeeded but user payload was incomplete.");
        }

        signIn({
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name ?? undefined,
            is_owner: user.is_owner,
          },
        });

        await syncSignupIntent(getStoredSignupIntent());
        navigate(targetAfterAuth(workspaceMode), { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      }
    };

    void complete();
  }, [getToken, isLoaded, isSignedIn, navigate, signIn, workspaceMode]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-md border border-border bg-card p-6 shadow-[0_24px_80px_-56px_rgba(30,27,46,0.55)]">
        <span className="inline-flex items-center gap-1.5 border border-brand bg-brand/8 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
          {error ? "Sign-in failed" : "Completing sign-in"}
        </span>
        <h1 className="mt-5 font-display text-3xl tracking-tight">
          {error ? "We could not finish sign-in." : "Connecting your workspace."}
        </h1>
        <div className="mt-6 text-sm text-muted-foreground">
          {error ? (
            <>
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
              <Link
                to="/signin"
                className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center bg-brand px-5 font-semibold text-paper"
                style={{ backgroundColor: BRAND.purple }}
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-brand" /> Just a moment…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
