import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router";

import { authFetch, readApiJson } from "../lib/api";
import {
  DNC_REGISTRY_URL,
  parseAreaCodes,
  type DncAreaCodeSuggestion,
  type DncSellerRegistrationState,
  type DncSellerVerification,
} from "../lib/dnc-seller-registration-rules";
import { Button, Skeleton } from "./atoms";
import { FormField, StatusNotice } from "./molecules";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";

type RegistrationResponse = {
  state: DncSellerRegistrationState;
  verification_available: boolean;
  dnc_san?: string | null;
  registration: {
    san: string;
    ftc_org_id: string | null;
    area_codes: string[] | "all";
    expires_on: string;
    verified: boolean;
    renewal_due: boolean;
  } | null;
  verification:
    | (Pick<DncSellerVerification, "state" | "ftc_org_id" | "san"> & {
        scheduled_on?: string | null;
      })
    | null;
  setup?: { suggested_area_codes: DncAreaCodeSuggestion[] };
};

const REGISTRATION_API = "/api/compliance/dnc-registration";
const FREE_AREA_CODES = 5;

const expiryFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" });

export default function DncRegistrationCard() {
  const [data, setData] = useState<RegistrationResponse | null>(null);
  const [view, setView] = useState<"guide" | "connect" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areaCodes, setAreaCodes] = useState("");
  const [copied, setCopied] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [san, setSan] = useState("");
  const [attest, setAttest] = useState(false);
  const attestId = useId();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await readApiJson<RegistrationResponse>(
        await authFetch(REGISTRATION_API, { signal }),
      );
      if (signal?.aborted) return;
      if (!result.ok) throw new Error(result.error);
      setData(result.data);
      setAreaCodes(
        (result.data.setup?.suggested_area_codes ?? [])
          .slice(0, FREE_AREA_CODES)
          .map((item) => item.code)
          .join(", "),
      );
    } catch {
      if (!signal?.aborted) setError("Could not load your Do Not Call subscription.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const verificationPending = data?.verification?.state === "pending";
  const verificationAvailable = data?.verification_available === true;
  const scheduledRenewal = data?.verification?.scheduled_on;
  useEffect(() => {
    if (!verificationPending || !verificationAvailable || view) return;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await readApiJson<RegistrationResponse>(
          await authFetch(REGISTRATION_API + "?status_only=1", { signal: controller.signal }),
        );
        if (result.ok && !controller.signal.aborted) {
          setData((previous) => ({ ...result.data, setup: previous?.setup }));
        }
      } catch {
        // The stored request continues on the server while this page is offline.
      }
    }
    const refreshOnFocus = () => void refresh();
    const timer = scheduledRenewal ? undefined : window.setInterval(refreshOnFocus, 15_000);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
      controller.abort();
    };
  }, [verificationPending, verificationAvailable, scheduledRenewal, view]);

  function openConnect(renewal = false) {
    setOrgId(data?.verification?.ftc_org_id ?? data?.registration?.ftc_org_id ?? "");
    setSan(
      renewal ? "" : (data?.verification?.san ?? data?.registration?.san ?? data?.dnc_san ?? ""),
    );
    setAttest(false);
    setError(null);
    setView("connect");
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await readApiJson<RegistrationResponse>(
        await authFetch(REGISTRATION_API, {
          method: "PUT",
          body: JSON.stringify({ ftc_org_id: orgId, san, attest }),
        }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData((previous) => ({ ...result.data, setup: previous?.setup }));
      setView(null);
    } catch {
      setError("Could not save your Do Not Call subscription. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const codes = parseAreaCodes(areaCodes);
  const chosenCodes = Array.isArray(codes) ? codes : [];
  const choices = new Set(chosenCodes);

  function toggleAreaCode(code: string) {
    const entries = areaCodes
      .trim()
      .split(/[\s,;]+/)
      .filter(Boolean);
    const next = entries.includes(code)
      ? entries.filter((entry) => entry !== code)
      : [...entries, code];
    setAreaCodes(next.join(", "));
    setCopied(false);
  }

  async function copyAreaCodes() {
    try {
      await navigator.clipboard.writeText(chosenCodes.join(", "));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (loading) return <Skeleton shape="surface" className="mt-3 h-24 w-full" />;
  if (!data) {
    return (
      <div className="mt-3 grid gap-3">
        <StatusNotice
          tone="destructive"
          title={error || "Could not load your Do Not Call subscription."}
        />
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const reg = data.registration;
  const verification = data.verification;
  const currentView = view ?? (data.state === "missing" ? "guide" : null);
  const registryLink = (
    <Button size="sm" variant="secondary" asChild>
      <a href={DNC_REGISTRY_URL} target="_blank" rel="noreferrer">
        <ExternalLink className="size-3.5" aria-hidden="true" />
        Open the FTC Registry
      </a>
    </Button>
  );

  return (
    <div className="mt-3 grid gap-4 text-sm">
      {currentView === "guide" ? (
        <>
          <p className="leading-6 text-muted-foreground">
            Set up Do Not Call screening before launching a sales campaign. The FTC issues a
            subscription number after you choose the area codes you plan to contact.
          </p>
          <div>
            <Button type="button" size="sm" variant="secondary" onClick={() => openConnect()}>
              I already have a subscription
            </Button>
          </div>
          <div className="grid gap-3 border-t border-border pt-4">
            <h3 className="font-semibold text-foreground">Choose recipient area codes</h3>
            <p className="leading-6 text-muted-foreground">
              {data.setup?.suggested_area_codes.length
                ? "We suggested up to five area codes from your recent recipients. Adjust this list to match who you plan to contact."
                : "Use the first three digits of the US phone numbers you plan to contact."}{" "}
              The first {FREE_AREA_CODES} area codes are free. The FTC collects any fee for
              additional coverage.
            </p>
            {data.setup?.suggested_area_codes.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Suggested recipient area codes">
                {data.setup.suggested_area_codes.map(({ code, contacts }) => {
                  const selected = choices.has(code);
                  return (
                    <li key={code}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleAreaCode(code)}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 wl-focus-ring-halo ${selected ? "border-brand bg-brand/10" : "border-border bg-card hover:bg-muted"}`}
                      >
                        {selected ? (
                          <Check className="size-3.5 text-brand" aria-hidden="true" />
                        ) : null}
                        <span className="font-semibold">{code}</span>
                        <span className="text-xs text-muted-foreground">
                          {contacts} {contacts === 1 ? "recipient" : "recipients"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <FormField label="Area codes to order">
              <Input
                placeholder="312, 773"
                value={areaCodes}
                onChange={(event) => {
                  setAreaCodes(event.target.value);
                  setCopied(false);
                }}
              />
            </FormField>
            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!chosenCodes.length}
                onClick={() => void copyAreaCodes()}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy Area Codes"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            <h3 className="font-semibold text-foreground">Get your subscription from the FTC</h3>
            <ol className="list-decimal space-y-1 pl-5 leading-6 text-muted-foreground">
              <li>Register your business as a Seller, then activate your FTC account.</li>
              <li>Under Create New Subscription, order the area codes you chose.</li>
              <li>
                After processing, sign in to get your Organization ID and subscription number (SAN).
              </li>
            </ol>
            <p className="text-xs leading-5 text-muted-foreground">
              A free subscription can take a few business days to process. Come back here once your
              number appears.
            </p>
            <div className="flex flex-wrap gap-2">
              {registryLink}
              <Button type="button" size="sm" onClick={() => openConnect()}>
                I Have My Subscription Number
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {currentView === "connect" ? (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void verify(event)}>
          <div className="grid gap-2 sm:col-span-2">
            <h3 className="font-semibold text-foreground">Connect your FTC subscription</h3>
            <p className="leading-6 text-muted-foreground">
              Sign in to the FTC Registry to find your Organization ID and subscription number. Look
              under Manage/Renew Subscriptions if the number is still processing.
            </p>
          </div>
          <FormField label="FTC Organization ID" required>
            <Input
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
              autoComplete="off"
              maxLength={30}
              spellCheck={false}
              required
            />
          </FormField>
          <FormField label="Subscription number (SAN)" required>
            <Input
              value={san}
              onChange={(event) => setSan(event.target.value)}
              autoComplete="off"
              maxLength={20}
              spellCheck={false}
              required
            />
          </FormField>
          <div className="flex items-start gap-2 sm:col-span-2">
            <Checkbox
              id={attestId}
              className="mt-1"
              checked={attest}
              onChange={(event) => setAttest(event.target.checked)}
            />
            <label htmlFor={attestId} className="leading-6">
              This subscription belongs to my business, and I authorize BotBound and its screening
              provider to verify it and use it for my sales calls and texts.
            </label>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              disabled={saving || !attest || !orgId.trim() || !san.trim()}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Verify Subscription
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setError(null);
                setView(null);
              }}
            >
              {data.state === "missing" ? "Back to Setup" : "Cancel"}
            </Button>
          </div>
        </form>
      ) : null}

      {currentView === null ? (
        <>
          {reg ? (
            <div className="grid gap-2 border-y border-border py-3">
              <p className="font-semibold">
                {data.state === "expired"
                  ? "Subscription expired"
                  : data.state === "active"
                    ? reg.verified
                      ? "Subscription verified"
                      : "Screening linked"
                    : "Awaiting screening link"}
              </p>
              <p className="text-muted-foreground">
                {reg.area_codes === "all" ? "All US area codes" : reg.area_codes.join(", ")} ·{" "}
                {data.state === "expired" ? "Expired" : "Expires"}{" "}
                {expiryFormat.format(new Date(reg.expires_on + "T00:00:00Z"))}
              </p>
              {reg.renewal_due ? (
                <p className="text-muted-foreground">
                  Renew at the FTC Registry and verify your new subscription number here.
                </p>
              ) : null}
            </div>
          ) : null}

          {verification?.state === "pending" && scheduledRenewal ? (
            <StatusNotice title="Renewal saved">
              BotBound will check your new subscription on{" "}
              {expiryFormat.format(new Date(scheduledRenewal + "T00:00:00Z"))}, as the new term
              begins.
            </StatusNotice>
          ) : verification?.state === "pending" ? (
            <StatusNotice
              title={
                verificationAvailable ? "Verifying subscription" : "Subscription details saved"
              }
            >
              {verificationAvailable
                ? "BotBound is checking the subscription. You can leave this page and come back to see the result."
                : "Verification will start when the screening connection is available for this workspace."}
            </StatusNotice>
          ) : null}
          {verification?.state === "failed" ? (
            <StatusNotice tone="warning" title="We couldn’t verify that subscription">
              Check that the Organization ID and current SAN belong to the same business. If you
              just subscribed or renewed, check the status at the FTC Registry before trying again.
            </StatusNotice>
          ) : null}
          {verification?.state === "unavailable" ? (
            <StatusNotice tone="warning" title="Screening verification is unavailable">
              Try again, or contact{" "}
              <a className="underline" href="mailto:support@botbound.app">
                BotBound support
              </a>{" "}
              if this continues.
            </StatusNotice>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {(data.state === "expired" || reg?.renewal_due) && registryLink}
            {data.state === "active" ? (
              <Button size="sm" asChild>
                <Link to="/phone?tab=outbound&view=campaigns">Go to Campaigns</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                openConnect(!verification && Boolean(reg?.renewal_due || data.state === "expired"))
              }
            >
              {verification
                ? "Check Subscription Details"
                : reg?.renewal_due || data.state === "expired"
                  ? "Verify Renewal"
                  : "Update Subscription"}
            </Button>
          </div>
        </>
      ) : null}
      {error ? <StatusNotice tone="destructive" title={error} /> : null}
    </div>
  );
}
