import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { WirelineLockup } from "../components/brand/WirelineBrand";
import { Button, Input } from "../components/atoms";
import { Checkbox } from "../components/ui/shadcn/Checkbox";
import { PageMeta } from "../lib/page-meta";
import type { VoicePermissionPublicView } from "../lib/recipient-voice-permission-contract";

function publicView(value: unknown): VoicePermissionPublicView {
  const view = value as VoicePermissionPublicView | null;
  if (
    !view ||
    typeof view !== "object" ||
    typeof view.seller_name !== "string" ||
    typeof view.disclosure !== "string" ||
    !/^[a-f0-9]{64}$/.test(view.disclosure_hash) ||
    typeof view.permission?.id !== "string" ||
    typeof view.permission.recipient_phone_masked !== "string" ||
    !["pending", "granted", "revoked", "expired", "used"].includes(view.permission.status) ||
    view.jurisdiction?.recipient_state !== "IL" ||
    view.jurisdiction.time_zone !== "America/Chicago"
  )
    throw new Error("The permission receipt could not be confirmed. Please retry.");
  return view;
}

type Confirmation = {
  token: string;
  signer_name: string;
  phone: string;
  accepted: true;
  disclosure_hash: string;
  recipient_state: "IL";
  recipient_time_zone: "America/Chicago";
};

export default function VoicePermissionPage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );
  const [view, setView] = useState<VoicePermissionPublicView | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [locationAccepted, setLocationAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [reload, setReload] = useState(0);
  const pendingConfirmation = useRef<Confirmation | null>(null);
  const submitting = useRef(false);

  useLayoutEffect(() => {
    // No query token, storage, telemetry or third-party scripts on this page.
    window.history.replaceState(window.history.state, "", "/voice-permission");
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (!token) {
      setLoading(false);
      setError("Reopen the permission link the business shared with you.");
      return () => controller.abort();
    }
    void (async () => {
      try {
        const response = await fetch("/api/voice-permissions/recipient/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            typeof body?.error === "string" ? body.error : "This permission link is unavailable.",
          );
        if (!controller.signal.aborted) setView(publicView(body));
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Permission could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [token, reload]);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!view || submitting.current) return;
    const payload = pendingConfirmation.current || {
      token,
      signer_name: name.trim(),
      phone,
      accepted: true as const,
      disclosure_hash: view.disclosure_hash,
      recipient_state: "IL" as const,
      recipient_time_zone: "America/Chicago" as const,
    };
    if (!pendingConfirmation.current && (!accepted || !locationAccepted)) return;
    pendingConfirmation.current = payload;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/voice-permissions/recipient/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          pendingConfirmation.current = null;
          setUncertain(false);
        }
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Confirmation could not be saved. Retry the same confirmation.",
        );
      }
      const next = publicView(body);
      if (
        next.permission.id !== view.permission.id ||
        !["granted", "used", "expired"].includes(next.permission.status)
      )
        throw new Error(
          "The signed permission could not be confirmed. Retry the same confirmation.",
        );
      setView(next);
      pendingConfirmation.current = null;
      setUncertain(false);
      setName("");
      setPhone("");
    } catch (cause) {
      setUncertain(Boolean(pendingConfirmation.current));
      setError(
        cause instanceof Error
          ? cause.message
          : "The result is unknown. Retry the same confirmation.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!view || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/voice-permissions/recipient/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null);
      if (
        !response.ok ||
        body?.permission?.id !== view.permission.id ||
        body.permission.status !== "revoked"
      )
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Withdrawal could not be confirmed. Please retry.",
        );
      setView({ ...view, permission: body.permission });
      pendingConfirmation.current = null;
      setUncertain(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Withdrawal could not be confirmed.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const status = view?.permission.status;
  return (
    <MarketingChrome authCanvas footer={false}>
      <PageMeta title="Call permission" path="/voice-permission" noIndex />
      <section className="mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col justify-center px-[12px] py-10 sm:px-6">
        <div className="mb-6 flex justify-center">
          <WirelineLockup />
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-[16px] shadow-sm sm:p-8">
          <div className="mb-4 flex min-w-0 items-center gap-2">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <h1 className="min-w-0 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">
              Call permission
            </h1>
          </div>
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading request…
            </p>
          ) : null}
          {!loading && view ? (
            <>
              <p className="text-sm [overflow-wrap:anywhere]">
                <strong>{view.seller_name}</strong> · {view.permission.recipient_phone_masked}
              </p>
              {status === "pending" ? (
                <form onSubmit={confirm} className="mt-5 min-w-0 space-y-4">
                  <p
                    id="permission-disclosure"
                    className="text-sm leading-relaxed [overflow-wrap:anywhere]"
                  >
                    {view.disclosure}
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="permission-phone">
                      Your phone number
                    </label>
                    <Input
                      id="permission-phone"
                      className="min-w-0"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      required
                      disabled={busy || uncertain}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="permission-name">
                      Your full name
                    </label>
                    <Input
                      id="permission-name"
                      className="min-w-0"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      minLength={2}
                      maxLength={120}
                      required
                      disabled={busy || uncertain}
                    />
                  </div>
                  <label className="flex min-w-0 items-start gap-3 text-sm">
                    <Checkbox
                      className="mt-1"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                      disabled={busy || uncertain}
                      required
                      aria-describedby="permission-disclosure"
                    />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      I agree to the permission above and sign electronically.
                    </span>
                  </label>
                  <label className="flex min-w-0 items-start gap-3 text-sm">
                    <Checkbox
                      className="mt-1"
                      checked={locationAccepted}
                      onChange={(event) => setLocationAccepted(event.target.checked)}
                      disabled={busy || uncertain}
                      required
                    />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      These calls will reach me in Illinois (America/Chicago). I’ll tell the
                      business if that changes.
                    </span>
                  </label>
                  <Button
                    type="submit"
                    className="w-full whitespace-normal"
                    disabled={
                      busy ||
                      (!uncertain &&
                        (!accepted || !locationAccepted || !name.trim() || !phone.trim()))
                    }
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    {uncertain ? "Retry confirmation" : "Sign permission"}
                  </Button>
                </form>
              ) : (
                <p role="status" className="mt-4 text-sm leading-relaxed">
                  {status === "granted"
                    ? "Permission saved. No call was scheduled by this form."
                    : status === "used"
                      ? "This permission has already authorized its one callback."
                      : status === "revoked"
                        ? "Permission withdrawn. This business’s future calls to this number are suppressed."
                        : "This permission request has expired. Ask the business for a new link."}
                </p>
              )}
              {status === "pending" || status === "granted" || status === "used" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-4 w-full whitespace-normal"
                  disabled={busy}
                  onClick={() => void withdraw()}
                >
                  {status === "pending" ? "Decline calls" : "Withdraw permission"}
                </Button>
              ) : null}
            </>
          ) : null}
          {error ? (
            <div className="mt-4 space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              {!view && token ? (
                <Button
                  variant="secondary"
                  disabled={loading}
                  onClick={() => setReload((count) => count + 1)}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Only sign for your own number. A signed request records permission; it does not prove
            phone ownership.{" "}
            <a href="/privacy" className="underline underline-offset-2" rel="noreferrer">
              Privacy
            </a>
          </p>
        </div>
      </section>
    </MarketingChrome>
  );
}
