import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";

import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";

const CHANNELS = ["voice", "sms", "email"] as const;
type Channel = (typeof CHANNELS)[number];
type ProviderStatus =
  | "not_requested"
  | "review_requested"
  | "in_review"
  | "approved"
  | "rejected"
  | "limited";

type IdentityResponse = {
  profile: {
    business_name: string | null;
    brand_name: string | null;
    logo_url: string | null;
    caller_id_name: string | null;
    website: string | null;
    support_email: string | null;
    default_call_reason: string | null;
    requested_channels: Channel[];
    review_requested_at: string | null;
  };
  phone_number: string | null;
  channels: Record<
    Channel,
    {
      profile_status: "incomplete" | "ready";
      provider_status: ProviderStatus;
      missing: string[];
      display_scope: string;
    }
  >;
  review_eligible: boolean;
  review_state_invalidated?: boolean;
  profile_changed?: boolean;
  message?: string;
  guarantee: string;
};

type IdentityForm = {
  business_name: string;
  brand_name: string;
  logo_url: string;
  caller_id_name: string;
  website: string;
  support_email: string;
  default_call_reason: string;
  requested_channels: Channel[];
};

const EMPTY_FORM: IdentityForm = {
  business_name: "",
  brand_name: "",
  logo_url: "",
  caller_id_name: "",
  website: "",
  support_email: "",
  default_call_reason: "",
  requested_channels: [...CHANNELS],
};

const FIELD_CLASS =
  "mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

function formFromIdentity(identity: IdentityResponse): IdentityForm {
  return {
    business_name: identity.profile.business_name ?? "",
    brand_name: identity.profile.brand_name ?? "",
    logo_url: identity.profile.logo_url ?? "",
    caller_id_name: identity.profile.caller_id_name ?? "",
    website: identity.profile.website ?? "",
    support_email: identity.profile.support_email ?? "",
    default_call_reason: identity.profile.default_call_reason ?? "",
    requested_channels: identity.profile.requested_channels.length
      ? identity.profile.requested_channels
      : [...CHANNELS],
  };
}

function formFingerprint(form: IdentityForm): string {
  return JSON.stringify({
    ...form,
    business_name: form.business_name.trim(),
    brand_name: form.brand_name.trim(),
    logo_url: form.logo_url.trim(),
    caller_id_name: form.caller_id_name.trim(),
    website: form.website.trim(),
    support_email: form.support_email.trim().toLowerCase(),
    default_call_reason: form.default_call_reason.trim(),
    requested_channels: [...form.requested_channels].sort(),
  });
}

function providerStatusLabel(status: ProviderStatus): string {
  switch (status) {
    case "review_requested":
      return "Review requested";
    case "in_review":
      return "Provider review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Needs changes";
    case "limited":
      return "Limited coverage";
    default:
      return "Not requested";
  }
}

function statusTone(status: ProviderStatus, ready: boolean) {
  if (status === "approved") return "border-emerald-500/25 bg-emerald-500/8 text-emerald-700";
  if (status === "rejected") return "border-destructive/25 bg-destructive/8 text-destructive";
  if (status === "review_requested" || status === "in_review")
    return "border-amber-500/25 bg-amber-500/8 text-amber-700";
  if (ready) return "border-primary/25 bg-primary/8 text-primary";
  return "border-border bg-muted/35 text-muted-foreground";
}

function ChannelCard({
  channel,
  identity,
}: {
  channel: Channel;
  identity: IdentityResponse;
}) {
  const meta = identity.channels[channel];
  const ready = meta.profile_status === "ready";
  const config = {
    voice: {
      icon: PhoneCall,
      title: "Calling identity",
      description: "Verified display name, optional logo and call reason, with CNAM fallback.",
    },
    sms: {
      icon: MessageSquareText,
      title: "SMS identity",
      description: "Business and campaign registration for compliant application-to-person messaging.",
    },
    email: {
      icon: Mail,
      title: "Email identity",
      description: "Company sender name and authenticated sending-domain preparation.",
    },
  }[channel];
  const Icon = config.icon;

  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{config.title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{config.description}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex min-h-7 shrink-0 items-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
            statusTone(meta.provider_status, ready),
          )}
        >
          {meta.provider_status === "not_requested"
            ? ready
              ? "Profile ready"
              : "Incomplete"
            : providerStatusLabel(meta.provider_status)}
        </span>
      </div>
      {meta.missing.length ? (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Missing: {meta.missing.join(", ")}.
        </p>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-foreground">
          <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />
          Identity profile is ready for review.
        </p>
      )}
      <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
        {meta.display_scope}
      </p>
    </article>
  );
}

export default function CompanyIdentityPack() {
  const [identity, setIdentity] = useState<IdentityResponse | null>(null);
  const [form, setForm] = useState<IdentityForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadIdentity() {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/company-identity");
      const body = (await response.json().catch(() => null)) as IdentityResponse | null;
      if (!response.ok || !body) throw new Error("Company identity is unavailable.");
      setIdentity(body);
      setForm(formFromIdentity(body));
      if (body.review_state_invalidated) {
        setMessage(
          "A company identity field changed after the prior review request, so Wireline reset the stale provider state.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Company identity is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIdentity();
  }, []);

  const selectedChannelCount = form.requested_channels.length;
  const isDirty = useMemo(() => {
    if (!identity) return false;
    return formFingerprint(form) !== formFingerprint(formFromIdentity(identity));
  }, [form, identity]);

  function updateField(field: keyof Omit<IdentityForm, "requested_channels">, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleChannel(channel: Channel) {
    setForm((current) => ({
      ...current,
      requested_channels: current.requested_channels.includes(channel)
        ? current.requested_channels.filter((item) => item !== channel)
        : [...current.requested_channels, channel],
    }));
  }

  async function saveIdentity() {
    if (saving || !isDirty) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authFetch("/api/company-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<IdentityResponse> & {
        error?: string;
      };
      if (!response.ok || !body.profile) {
        throw new Error(body.error || "Could not save company identity.");
      }
      const saved = body as IdentityResponse;
      setIdentity(saved);
      setForm(formFromIdentity(saved));
      setMessage(
        saved.profile_changed
          ? "Company identity saved. Prior review states were reset because the verified profile changed."
          : "Company identity saved. Existing review state was preserved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save company identity.");
    } finally {
      setSaving(false);
    }
  }

  async function requestReview() {
    if (requesting || isDirty) return;
    setRequesting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authFetch("/api/company-identity/review-request", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as Partial<IdentityResponse> & {
        error?: string;
      };
      if (!response.ok || !body.profile) {
        throw new Error(body.error || "Could not request verification review.");
      }
      const reviewed = body as IdentityResponse;
      setIdentity(reviewed);
      setForm(formFromIdentity(reviewed));
      setMessage(reviewed.message || "Verification review requested.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request verification review.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="studio-card mt-5 p-5 sm:p-6" aria-labelledby="company-identity-title">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
            <Building2 size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Company identity pack
            </p>
            <h2 id="company-identity-title" className="mt-2 text-xl font-semibold text-foreground">
              Brand the employee, not just the dashboard.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Prepare one verified company identity for the employee's dedicated number, SMS sender,
              and email sender. Provider approval and recipient-device display remain external states.
            </p>
          </div>
        </div>
        {identity?.profile.review_requested_at ? (
          <span className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/8 px-3 text-[11px] font-semibold text-amber-700">
            <Clock3 size={14} aria-hidden="true" />
            Review requested
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading company identity…</p>
      ) : identity ? (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {CHANNELS.map((channel) => (
              <ChannelCard key={channel} channel={channel} identity={identity} />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-background/55 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Verified business profile</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{identity.guarantee}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-foreground">
                Legal business name
                <input
                  value={form.business_name}
                  onChange={(event) => updateField("business_name", event.target.value)}
                  className={FIELD_CLASS}
                  maxLength={120}
                  autoComplete="organization"
                  placeholder="Laurenzo Services LLC"
                />
              </label>
              <label className="text-xs font-medium text-foreground">
                Customer-facing brand name
                <input
                  value={form.brand_name}
                  onChange={(event) => updateField("brand_name", event.target.value)}
                  className={FIELD_CLASS}
                  maxLength={80}
                  placeholder="Laurenzo Services"
                />
              </label>
              <label className="text-xs font-medium text-foreground">
                Caller ID fallback name
                <input
                  value={form.caller_id_name}
                  onChange={(event) =>
                    updateField("caller_id_name", event.target.value.toUpperCase().slice(0, 15))
                  }
                  className={FIELD_CLASS}
                  maxLength={15}
                  placeholder="LAURENZO SVCS"
                />
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  Maximum 15 characters for traditional CNAM fallback.
                </span>
              </label>
              <label className="text-xs font-medium text-foreground">
                Company website
                <input
                  type="url"
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="https://example.com"
                  autoComplete="url"
                />
              </label>
              <label className="text-xs font-medium text-foreground">
                Support email
                <input
                  type="email"
                  value={form.support_email}
                  onChange={(event) => updateField("support_email", event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="support@example.com"
                  autoComplete="email"
                />
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  Email identity review requires this address to match the company website domain.
                </span>
              </label>
              <label className="text-xs font-medium text-foreground">
                Logo URL
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={(event) => updateField("logo_url", event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="https://example.com/logo.png"
                />
              </label>
              <label className="text-xs font-medium text-foreground sm:col-span-2">
                Default call reason
                <input
                  value={form.default_call_reason}
                  onChange={(event) => updateField("default_call_reason", event.target.value)}
                  className={FIELD_CLASS}
                  maxLength={64}
                  placeholder="Appointment confirmation"
                />
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  Enhanced branded calling may show this on supported mobile networks after approval.
                </span>
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-semibold text-foreground">Request identity for</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {CHANNELS.map((channel) => (
                  <label
                    key={channel}
                    className={cn(
                      "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-medium transition",
                      form.requested_channels.includes(channel)
                        ? "border-primary/30 bg-primary/8 text-primary"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form.requested_channels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                      className="size-4 accent-primary"
                    />
                    {channel === "voice" ? "Calling" : channel === "sms" ? "SMS" : "Email"}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={saveIdentity}
                disabled={saving || selectedChannelCount === 0 || !isDirty}
              >
                {saving ? "Saving…" : "Save identity"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={requestReview}
                disabled={requesting || !identity.review_eligible || isDirty}
              >
                {requesting ? "Requesting…" : "Request verification review"}
              </Button>
            </div>
            {isDirty ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Save these changes before requesting verification review.
              </p>
            ) : !identity.review_eligible ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Complete every selected channel requirement before requesting verification review.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {message ? (
        <StatusNotice tone="info" className="mt-5" title="Company identity updated">
          {message}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" className="mt-5" title="Company identity unavailable">
          {error}
        </StatusNotice>
      ) : null}
    </section>
  );
}
