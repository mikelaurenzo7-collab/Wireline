import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

export default function AcceptInvite() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token")?.trim() || "";
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (loading || started.current) return;
    if (!token) {
      setStatus("error");
      setMessage("This invitation link is incomplete.");
      return;
    }
    if (!user) {
      const destination = `/accept-invite?token=${encodeURIComponent(token)}`;
      navigate(`/signup?redirect=${encodeURIComponent(destination)}`, { replace: true });
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
        setStatus("success");
        setMessage("You now have access to the shared workspace.");
        // The acceptance endpoint rotates the session into the shared tenant.
        // Reload the app so every provider hydrates against that new workspace
        // instead of retaining personal-workspace caches in memory.
        window.setTimeout(() => window.location.assign("/overview"), 900);
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "The invitation could not be accepted.");
      });
  }, [loading, navigate, token, user]);

  return (
    <MarketingChrome stickyCta={false} footer={false}>
      <PageMeta
        title="Accept workspace invitation — Wireline"
        description="Join a shared Wireline workspace."
        path="/accept-invite"
        noIndex
      />
      <main id="main-content" className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-7 text-center shadow-sm sm:p-9">
          {status === "error" ? (
            <>
              <TriangleAlert className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
              <h1 className="mt-4 text-title">Invitation unavailable</h1>
              <p role="alert" className="mt-3 text-caption text-muted-foreground">
                {message}
              </p>
              <Link to="/signin" className="marketing-btn-secondary mt-6 inline-flex min-h-11 items-center">
                Sign in with another email
              </Link>
            </>
          ) : status === "success" ? (
            <>
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden="true" />
              <h1 className="mt-4 text-title">Workspace joined</h1>
              <p className="mt-3 text-caption text-muted-foreground">{message}</p>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" aria-hidden="true" />
              <h1 className="mt-4 text-title">Joining workspace</h1>
              <p className="mt-3 text-caption text-muted-foreground">
                Verifying the invitation and your account.
              </p>
            </>
          )}
        </section>
      </main>
    </MarketingChrome>
  );
}
