import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { WirelineLockup } from "../components/brand/WirelineBrand";
import { PageMeta } from "../lib/page-meta";

const PENDING_INVITE_KEY = "wireline_pending_invitation";
const SIGN_IN_RETURN = `/signin?redirect=${encodeURIComponent("/accept-invite")}`;

function persistInviteToken(token: string): boolean {
  try {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
    else sessionStorage.removeItem(PENDING_INVITE_KEY);
    return true;
  } catch {
    return false;
  }
}

function readInviteToken(search: string, hash: string): string {
  const queryToken = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    .get("token")
    ?.trim();
  const fragmentToken = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
    .get("token")
    ?.trim();
  if (fragmentToken || queryToken) return fragmentToken || queryToken || "";
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export default function AcceptInvite() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => readInviteToken(location.search, location.hash));
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [inviteStored, setInviteStored] = useState(true);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  useLayoutEffect(() => {
    if (token) setInviteStored(persistInviteToken(token));
    if (location.search || location.hash) {
      window.history.replaceState(window.history.state, "", location.pathname);
    }
  }, [location.hash, location.pathname, location.search, token]);

  const acceptInvitation = useCallback(async () => {
    setStatus("working");
    setCanRetry(false);
    let invalidToken = false;
    try {
      const response = await fetch("/api/team/invitations/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Other HTTP 400 responses also cover a different signed-in email.
        // Keep those invitations available for another-account recovery.
        invalidToken = response.status === 400 && payload?.error === "Invalid invitation token.";
        if (invalidToken) persistInviteToken("");
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.message === "string"
              ? payload.message
              : "The invitation could not be accepted.",
        );
      }
      if (payload?.success !== true)
        throw new Error("The invitation could not be confirmed. Try again.");
      persistInviteToken("");
      setStatus("success");
      setMessage("You now have access to the shared workspace.");
      window.setTimeout(() => window.location.assign("/studio"), 900);
    } catch (error: unknown) {
      setCanRetry(!invalidToken);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The invitation could not be accepted.");
    }
  }, [token]);

  useEffect(() => {
    if (loading || started.current) return;
    if (!token) {
      persistInviteToken("");
      setStatus("error");
      setMessage("This invitation link is incomplete.");
      return;
    }
    if (!user) {
      if (!persistInviteToken(token)) {
        setStatus("error");
        setMessage("Sign in, then reopen this invitation link. This browser cannot save it.");
        return;
      }
      navigate(`/signup?redirect=${encodeURIComponent("/accept-invite")}`, { replace: true });
      return;
    }

    started.current = true;
    void acceptInvitation();
  }, [acceptInvitation, loading, navigate, token, user]);

  const switchAccount = async () => {
    started.current = true;
    setSwitchingAccount(true);
    try {
      if (user) await signOut({ requireServerConfirmation: true });
      navigate(SIGN_IN_RETURN);
    } catch {
      setMessage("Sign-out could not finish. Try again.");
    } finally {
      setSwitchingAccount(false);
    }
  };

  const working = status === "idle" || status === "working";

  return (
    <MarketingChrome stickyCta={false} footer={false} authCanvas>
      <PageMeta
        title="Accept Workspace Invitation | BotBound"
        description="Join a shared BotBound workspace."
        path="/accept-invite"
        noIndex
      />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <section
          className="wl-auth-card w-full max-w-[420px] rounded-md p-6 text-center sm:p-8"
          aria-live="polite"
          aria-busy={working}
        >
          <div className="flex justify-center">
            <WirelineLockup size="compact" surface="tile" />
          </div>

          <div className="mt-7 flex justify-center" aria-hidden="true">
            {status === "error" ? (
              <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
                <TriangleAlert className="size-5" />
              </span>
            ) : status === "success" ? (
              <span className="wl-status-success wl-text-success grid size-11 place-items-center rounded-full">
                <CheckCircle2 className="size-5" />
              </span>
            ) : (
              <span className="grid size-11 place-items-center rounded-full bg-brand/10 text-brand">
                <Loader2 className="size-5 animate-spin" />
              </span>
            )}
          </div>

          <h1 className="mt-4 font-display text-2xl leading-[1.05] tracking-[-.025em] text-foreground sm:text-3xl">
            {status === "error"
              ? "Invitation Unavailable"
              : status === "success"
                ? "Workspace Joined"
                : "Joining Workspace"}
          </h1>
          <p
            role={status === "error" ? "alert" : undefined}
            className="mt-3 text-caption leading-relaxed text-muted-foreground"
          >
            {status === "error"
              ? message
              : status === "success"
                ? message
                : "Verifying the invitation and your account."}
          </p>

          {status === "error" ? (
            <div className="mt-7 space-y-3">
              {canRetry ? (
                <button
                  type="button"
                  onClick={() => void acceptInvitation()}
                  disabled={switchingAccount}
                  className="marketing-btn-primary inline-flex min-h-12 w-full items-center justify-center"
                >
                  Try Again
                </button>
              ) : null}
              {!inviteStored && user ? (
                <p className="text-caption text-muted-foreground">
                  After signing in, reopen the invitation link.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void switchAccount()}
                disabled={switchingAccount}
                className="marketing-btn-secondary inline-flex min-h-12 w-full items-center justify-center"
              >
                {switchingAccount
                  ? "Signing Out…"
                  : user
                    ? "Sign in with another email"
                    : "Sign In"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </MarketingChrome>
  );
}
