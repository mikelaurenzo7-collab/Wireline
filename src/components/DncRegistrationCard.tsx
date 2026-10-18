import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { authFetch, readApiJson } from "../lib/api";
import {
  DNC_REGISTRY_URL,
  type DncSellerRegistrationState,
} from "../lib/dnc-seller-registration-rules";
import { Button, Skeleton } from "./atoms";
import { FormField, StatusNotice } from "./molecules";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";

type RegistrationResponse = {
  state: DncSellerRegistrationState;
  registry_url: string;
  registration: {
    san: string;
    seller_name: string;
    area_codes: string[] | "all";
    expires_on: string;
    attested_at: string;
    screening_connected: boolean;
  } | null;
};

const STATE_COPY: Record<DncSellerRegistrationState, { label: string; detail: string }> = {
  missing: {
    label: "Not added",
    detail: "Marketing calls and texts stay paused until you add your own registry subscription.",
  },
  pending_link: {
    label: "Connecting",
    detail:
      "BotBound is connecting screening to your subscription. Marketing calls and texts start once it is connected.",
  },
  expired: {
    label: "Expired",
    detail: "Renew your subscription at the registry, then update the expiration date here.",
  },
  active: {
    label: "Active",
    detail: "Marketing calls and texts are screened against the registry with your subscription.",
  },
};

export default function DncRegistrationCard() {
  const [data, setData] = useState<RegistrationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [san, setSan] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [areaCodes, setAreaCodes] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [attest, setAttest] = useState(false);
  const attestId = useId();

  const applyResponse = useCallback((next: RegistrationResponse) => {
    setData(next);
    const reg = next.registration;
    setSan(reg?.san ?? "");
    setSellerName(reg?.seller_name ?? "");
    setAreaCodes(reg ? (reg.area_codes === "all" ? "all" : reg.area_codes.join(", ")) : "");
    setExpiresOn(reg?.expires_on ?? "");
    setAttest(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await readApiJson<RegistrationResponse>(
        await authFetch("/api/compliance/dnc-registration"),
      );
      if (!result.ok) throw new Error(result.error);
      applyResponse(result.data);
    } catch {
      setError("Could not load your Do Not Call registration.");
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await readApiJson<RegistrationResponse>(
        await authFetch("/api/compliance/dnc-registration", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            san,
            seller_name: sellerName,
            area_codes: areaCodes,
            expires_on: expiresOn,
            attest,
          }),
        }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyResponse(result.data);
      setEditing(false);
    } catch {
      setError("Could not save your Do Not Call registration.");
    } finally {
      setSaving(false);
    }
  }

  const state = data?.state ?? "missing";
  const reg = data?.registration ?? null;
  const showForm = editing || state === "missing";

  return (
    <section
      className="wl-paper wl-paper-elevated p-4 sm:p-5"
      aria-labelledby="dnc-registration-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id="dnc-registration-title" className="text-sm font-semibold text-foreground">
          Do Not Call Registration
        </h3>
        {!loading ? (
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {STATE_COPY[state].label}
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton shape="surface" className="mt-3 h-[96px] w-full" />
      ) : (
        <div className="mt-3 grid gap-3 text-sm">
          <p className="leading-6 text-muted-foreground">{STATE_COPY[state].detail}</p>

          {reg && !showForm ? (
            <dl className="grid gap-2 border-y border-border py-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Registered seller</dt>
                <dd className="font-medium text-foreground">{reg.seller_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">SAN</dt>
                <dd className="font-medium text-foreground">{reg.san}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Area codes</dt>
                <dd className="font-medium text-foreground">
                  {reg.area_codes === "all" ? "All area codes" : reg.area_codes.join(", ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Expires</dt>
                <dd className="font-medium text-foreground">{reg.expires_on}</dd>
              </div>
            </dl>
          ) : null}

          {showForm ? (
            <>
              <ol className="grid list-decimal gap-1 pl-5 leading-6 text-muted-foreground">
                <li>
                  Register your business as a Seller at{" "}
                  <a
                    href={DNC_REGISTRY_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    telemarketing.donotcall.gov
                    <ExternalLink className="ml-1 inline size-3" aria-hidden="true" />
                  </a>{" "}
                  with your EIN (sole proprietors can use an SSN).
                </li>
                <li>
                  Subscribe to every area code you plan to call. The first 5 are free; more cost an
                  annual fee per area code.
                </li>
                <li>Copy your subscription account number (SAN) and expiration date below.</li>
              </ol>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
                <FormField label="Subscription account number (SAN)" required>
                  <Input
                    value={san}
                    onChange={(event) => setSan(event.target.value)}
                    autoComplete="off"
                    maxLength={20}
                  />
                </FormField>
                <FormField label="Registered business name" required>
                  <Input
                    value={sellerName}
                    onChange={(event) => setSellerName(event.target.value)}
                    autoComplete="organization"
                    maxLength={200}
                  />
                </FormField>
                <FormField
                  label="Area codes"
                  description='Separate with commas, or enter "all" for the nationwide list.'
                  required
                >
                  <Input
                    value={areaCodes}
                    onChange={(event) => setAreaCodes(event.target.value)}
                    placeholder="312, 773"
                    inputMode="numeric"
                  />
                </FormField>
                <FormField label="Subscription expires" required>
                  <Input
                    type="date"
                    value={expiresOn}
                    onChange={(event) => setExpiresOn(event.target.value)}
                  />
                </FormField>
                <div className="flex items-start gap-2 sm:col-span-2">
                  <Checkbox
                    id={attestId}
                    className="mt-1"
                    checked={attest}
                    onChange={(event) => setAttest(event.target.checked)}
                  />
                  <label htmlFor={attestId} className="leading-6 text-foreground">
                    This subscription belongs to my business, and I authorize BotBound to screen my
                    marketing calls and texts against the registry with it.
                  </label>
                </div>
                {error ? (
                  <StatusNotice tone="destructive" className="sm:col-span-2" title={error} />
                ) : null}
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="submit" size="sm" disabled={saving || !attest}>
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Save Registration
                  </Button>
                  {reg ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (data) applyResponse(data);
                        setError(null);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Update Registration
              </Button>
            </div>
          )}

          {error && !showForm ? <StatusNotice tone="destructive" title={error} /> : null}
        </div>
      )}
    </section>
  );
}
