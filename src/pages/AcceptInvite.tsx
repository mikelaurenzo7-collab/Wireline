import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import MarketingChrome from "../components/marketing/MarketingChrome";
import WirelineMark from "../components/brand/WirelineMark";
import { PageMeta } from "../lib/page-meta";

const PENDING_INVITE_KEY = "wireline_pending_invitation";

function readInviteToken(search: string, hash: string): string {
  const queryToken = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    .get("token")
    ?.trim();
  const fragmentToken = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
    .get("token")
    ?.trim();
  return fragmentToken || queryToken || sessionStorage.getItem(PENDING_INVITE_KEY)?.trim() || "";
}

export default function AcceptInvite() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => readInviteToken(location.search, location.hash));
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useLayoutEffect(() => {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
    if (location.search || location.hash) {
      window.history.replaceState(window.history.state, "", location.pathname);
    }
  }, [location.hash, location.pathname, location.search, token]);

  useEffect(() => {
    if (loading || started.current) return;
    if (!token) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      setStatus("error");
      setMessage("This invitation link is incomplete.");
      return;
    }
    if (!user) {
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
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "The invitation could not be accepted.",
          );
        }
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        setStatus("success");
        setMessage("You now have access to the shared workspace.");
        // The acceptance endpoint rotates the session into the shared tenant.
        // Reload the app so every provider hydrates against that new workspace
        // instead of retaining personal-workspace caches in memory.
        window.setTimeout(() => window.location.assign("/overview"), 900);
      })
      .catch((error: unknown) => {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "The invitation could not be accepted.",
        );
      });
  }, [loading, navigate, token, user]);

  const working = status === "idle" || status === "working";

  return (
    <MarketingChrome stickyCta={false} footer={false} authCanvas>
      <PageMeta
        title="Accept workspace invitation | Wireline"
        description="Join a shared Wireline workspace."
        path="/accept-invite"
        noIndex
      />
      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-4 py-8 pt-20 sm:pt-24"
      >
        <section
          className="wl-auth-card w-full max-w-[420px] rounded-md p-6 text-center sm:p-8"
          aria-live="polite"
          aria-busy={working}
        >
          <div className="flex justify-center">
            <div className="wl-auth-brand-chip" aria-hidden="true">
              <WirelineMark className="size-8 text-white" />
            </div>
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
            <Link
              to="/signin"
              className="marketing-btn-secondary mt-7 inline-flex min-h-12 w-full items-center justify-center"
            >
              Sign in with another email
            </Link>
          ) : null}
        </section>
      </main>
    </MarketingChrome>
  );
}
