import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { WirelineLockup } from "../components/brand/WirelineBrand";
import { PageMeta } from "../lib/page-meta";

const PENDING_INVITE_KEY = "wireline_pending_invitation";

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

function storeInviteToken(token: string): boolean {
  try {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
    else sessionStorage.removeItem(PENDING_INVITE_KEY);
    return true;
  } catch {
    return false;
  }
}

export default function AcceptInvite() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => readInviteToken(location.search, location.hash));
  const started = useRef(false);
  const mounted = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useLayoutEffect(() => {
    if (token) storeInviteToken(token);
    if (location.search || location.hash) {
      window.history.replaceState(window.history.state, "", location.pathname);
    }
  }, [location.hash, location.pathname, location.search, token]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (loading || started.current) return;
    if (!token) {
      setStatus("error");
      setMessage("This invitation link is incomplete.");
      return;
    }
    if (!user) {
      if (!storeInviteToken(token)) {
        setStatus("error");
        setMessage(
          "Allow session storage in your browser, then reopen your invitation to sign in.",
        );
        return;
      }
      navigate(`/signup?redirect=${encodeURIComponent("/accept-invite")}`, { replace: true });
      return;
    }

    started.current = true;
    setStatus("working");
    void fetch("/api/team/invitations/accept", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!mounted.current) return;
        if (!response.ok || payload?.success !== true) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "The invitation could not be accepted.",
          );
        }
        storeInviteToken("");
        setStatus("success");
        setMessage("You now have access to the shared workspace.");
      })
      .catch((error: unknown) => {
        if (!mounted.current) return;
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "The invitation could not be accepted.",
        );
      });
  }, [attempt, loading, navigate, token, user]);

  async function switchAccount() {
    if (!storeInviteToken(token)) {
      setMessage(
        "Allow session storage in your browser before switching accounts, then reopen the invitation.",
      );
      return;
    }
    setStatus("working");
    try {
      await signOut();
      if (mounted.current)
        navigate(`/signin?redirect=${encodeURIComponent("/accept-invite")}`, { replace: true });
    } catch {
      if (mounted.current) {
        setStatus("error");
        setMessage("Sign-out did not complete. Try again.");
      }
    }
  }

  const working = status === "idle" || status === "working";

  return (
    <MarketingChrome stickyCta={false} footer={false} authCanvas>
      <PageMeta
        title="Accept workspace invitation | BotBound"
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
              ? "Invitation unavailable"
              : status === "success"
                ? "Workspace joined"
                : "Joining workspace"}
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
            <div className="mt-7 grid gap-3">
              {token ? (
                <button
                  type="button"
                  onClick={() => {
                    started.current = false;
                    setAttempt((value) => value + 1);
                  }}
                  className="marketing-btn-primary inline-flex min-h-12 w-full items-center justify-center"
                >
                  Try again
                </button>
              ) : null}
              {user && token ? (
                <>
                  <p className="break-words text-sm text-muted-foreground">
                    Signed in as {user.email}
                  </p>
                  <button
                    type="button"
                    onClick={() => void switchAccount()}
                    className="marketing-btn-secondary inline-flex min-h-12 w-full items-center justify-center"
                  >
                    Sign in with another email
                  </button>
                </>
              ) : null}
              <a
                href="/settings/team"
                className="marketing-btn-secondary inline-flex min-h-12 w-full items-center justify-center"
              >
                View workspaces
              </a>
            </div>
          ) : status === "success" ? (
            <button
              type="button"
              onClick={() => window.location.assign("/studio")}
              className="marketing-btn-primary mt-7 inline-flex min-h-12 w-full items-center justify-center"
            >
              Open workspace
            </button>
          ) : null}
        </section>
      </div>
    </MarketingChrome>
  );
}
