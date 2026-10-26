import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";

import { authFetch, readApiJson } from "../lib/api";
import {
  DNC_REGISTRY_URL,
  parseAreaCodes,
  type DncAreaCodeSuggestion,
  type DncSellerRegistrationState,
} from "../lib/dnc-seller-registration-rules";
import { DNC_SAN_HELP } from "../lib/outbound-compliance-copy";
import { Button, Skeleton } from "./atoms";
import { FormField, StatusNotice } from "./molecules";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";

type RegistrationResponse = {
  state: DncSellerRegistrationState;
  registry_url: string;
  dnc_san?: string | null;
  dnc_san_help?: string;
  registration: {
    san: string;
    seller_name: string;
    area_codes: string[] | "all";
    expires_on: string;
    attested_at: string;
    screening_connected: boolean;
  } | null;
  setup?: {
    suggested_seller_name: string | null;
    suggested_area_codes: DncAreaCodeSuggestion[];
    suggested_expires_on: string;
    outbound_contact_count: number;
  };
};

export const DNC_REGISTRATION_STATE_LABEL: Record<DncSellerRegistrationState, string> = {
  missing: "Not added",
  pending_link: "Connecting",
  expired: "Expired",
  active: "Active",
};

const STATE_DETAIL: Record<DncSellerRegistrationState, string> = {
  missing:
    "Optional. If you have a National Do Not Call Registry account number, paste it below. Sales screening still runs. Personal, appointment, and follow-up calls don't use it.",
  pending_link:
    "Your account number is saved. Sales screening uses it when you add it. You do not have to wait for anything else to connect.",
  expired: "Renew your subscription at the registry, then update the expiration date here.",
  active: "Sales calls and texts can include your registry account number.",
};

/** Registry subscriptions include five area codes at no cost. */
const FREE_AREA_CODES = 5;

/** The owner's typed list, token by token, so a toggle never discards their edits. */
function areaCodeTokens(value: string): string[] {
  if (value.trim().toLowerCase() === "all") return [];
  return value
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function suggestionNote(suggestion: DncAreaCodeSuggestion): string {
  const parts: string[] = [];
  if (suggestion.ownLine) parts.push("your line");
  if (suggestion.contacts > 0) {
    parts.push(`${suggestion.contacts} ${suggestion.contacts === 1 ? "contact" : "contacts"}`);
  }
  return parts.join(" · ");
}

export default function DncRegistrationCard({
  onStateChange,
}: {
  onStateChange?: (state: DncSellerRegistrationState) => void;
} = {}) {
  const [data, setData] = useState<RegistrationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [san, setSan] = useState("");
  const [workspaceSan, setWorkspaceSan] = useState("");
  const [savingSan, setSavingSan] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [areaCodes, setAreaCodes] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [attest, setAttest] = useState(false);
  const attestId = useId();
  // A ref keeps an inline parent callback from re-creating load() each render.
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const applyResponse = useCallback((next: RegistrationResponse) => {
    setData((previous) => ({ ...next, setup: next.setup ?? previous?.setup }));
    onStateChangeRef.current?.(next.state);
    setWorkspaceSan(next.dnc_san ?? "");
    const reg = next.registration;
    const setup = next.setup;
    setSan(reg?.san ?? "");
    // A first-time owner starts from BotBound's prefill; a saved
    // registration always shows exactly what was saved.
    setSellerName(reg?.seller_name ?? setup?.suggested_seller_name ?? "");
    setAreaCodes(
      reg
        ? reg.area_codes === "all"
          ? "all"
          : reg.area_codes.join(", ")
        : (setup?.suggested_area_codes ?? [])
            .slice(0, FREE_AREA_CODES)
            .map((item) => item.code)
            .join(", "),
    );
    setExpiresOn(reg?.expires_on ?? setup?.suggested_expires_on ?? "");
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

  async function saveWorkspaceSan(event: FormEvent) {
    event.preventDefault();
    setSavingSan(true);
    setError(null);
    try {
      const result = await readApiJson<{ dnc_san: string | null }>(
        await authFetch("/api/compliance/dnc-san", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ san: workspaceSan }),
        }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWorkspaceSan(result.data.dnc_san ?? "");
    } catch {
      setError("Could not save the account number.");
    } finally {
      setSavingSan(false);
    }
  }

  async function copyAreaCodes(codes: string) {
    try {
      await navigator.clipboard.writeText(codes);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const state = data?.state ?? "missing";
  const reg = data?.registration ?? null;
  const suggestions = data?.setup?.suggested_area_codes ?? [];
  const showForm = editing || state === "missing";
  // The form field is the one list: it is what the owner subscribes to at the
  // registry and what BotBound screens against, so chips and Copy both use it.
  const nationwide = parseAreaCodes(areaCodes) === "all";
  const chosenCodes = areaCodeTokens(areaCodes);
  const chosen = new Set(chosenCodes);

  function toggleAreaCode(code: string) {
    const next = chosen.has(code)
      ? chosenCodes.filter((token) => token !== code)
      : [...chosenCodes, code];
    setAreaCodes(next.join(", "));
  }

  return (
    <section
      className="wl-paper wl-paper-elevated p-4 sm:p-5"
      aria-labelledby="dnc-registration-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id="dnc-registration-title" className="text-sm font-semibold text-foreground">
          Do Not Call Registry
        </h3>
        {!loading ? (
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {DNC_REGISTRATION_STATE_LABEL[state]}
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton shape="surface" className="mt-3 h-[96px] w-full" />
      ) : (
        <div className="mt-3 grid gap-4 text-sm">
          <p className="leading-6 text-muted-foreground">{STATE_DETAIL[state]}</p>
          <form className="grid gap-2" onSubmit={(event) => void saveWorkspaceSan(event)}>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Registry account number (optional)
              </span>
              <Input
                value={workspaceSan}
                onChange={(event) => setWorkspaceSan(event.target.value)}
                autoComplete="off"
                placeholder="Leave blank if you don't have one"
                aria-describedby="dnc-san-help"
              />
            </label>
            <p id="dnc-san-help" className="text-xs leading-5 text-muted-foreground">
              {data?.dnc_san_help || DNC_SAN_HELP}
            </p>
            <Button type="submit" variant="secondary" disabled={savingSan}>
              {savingSan ? <Loader2 className="size-4 animate-spin" /> : null}
              Save account number
            </Button>
          </form>

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
              {state === "missing" ? (
                <p className="text-xs font-medium text-muted-foreground">
                  About 10 minutes · Free for up to {FREE_AREA_CODES} area codes
                </p>
              ) : null}
              <ol className="grid gap-4">
                <li className="grid gap-2">
                  <p className="font-medium text-foreground">1. Create your free Seller account</p>
                  <p className="leading-6 text-muted-foreground">
                    At the FTC registry, choose <span className="text-foreground">Seller</span> (not
                    Telemarketer). Have your EIN ready; sole proprietors can use an SSN.
                  </p>
                  <div>
                    <Button type="button" size="sm" variant="secondary" asChild>
                      <a href={DNC_REGISTRY_URL} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        Open the Registry
                      </a>
                    </Button>
                  </div>
                </li>

                <li className="grid gap-2">
                  <p className="font-medium text-foreground">2. Subscribe to your area codes</p>
                  {suggestions.length ? (
                    <>
                      <p className="leading-6 text-muted-foreground">
                        Based on your lines and contacts. Tap to add or remove; the selected list is
                        what you subscribe to at the registry and what BotBound screens.
                      </p>
                      <ul className="flex flex-wrap gap-2" aria-label="Suggested area codes">
                        {suggestions.map((item) => {
                          const selected = nationwide || chosen.has(item.code);
                          return (
                            <li key={item.code}>
                              <button
                                type="button"
                                aria-pressed={selected}
                                disabled={nationwide}
                                onClick={() => toggleAreaCode(item.code)}
                                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors wl-focus-ring-halo disabled:cursor-default ${
                                  selected
                                    ? "border-brand bg-brand/10 text-foreground"
                                    : "border-border bg-card text-foreground hover:bg-muted"
                                }`}
                              >
                                {selected ? (
                                  <Check className="size-3.5 text-brand" aria-hidden="true" />
                                ) : null}
                                <span className="font-semibold">{item.code}</span>
                                <span className="text-xs text-muted-foreground">
                                  {suggestionNote(item)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={nationwide || chosenCodes.length === 0}
                          onClick={() => void copyAreaCodes(chosenCodes.join(", "))}
                        >
                          {copied ? (
                            <Check className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Copy className="size-3.5" aria-hidden="true" />
                          )}
                          {copied ? "Copied" : "Copy Selected Area Codes"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="leading-6 text-muted-foreground">
                      Subscribe to each area code your Bot will call. Your own line's area code is a
                      good start.
                    </p>
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {nationwide
                      ? "The nationwide list covers every area code at the registry's full annual fee."
                      : `${chosenCodes.length} selected. The first ${FREE_AREA_CODES} are free; each extra area code has an annual fee.`}
                  </p>
                </li>

                <li className="grid gap-3">
                  <p className="font-medium text-foreground">
                    3. Paste your subscription account number (SAN)
                  </p>
                  <p className="leading-6 text-muted-foreground">
                    The registry shows it right after you subscribe. We filled in the rest; check it
                    matches your registry receipt.
                  </p>
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(event) => void save(event)}
                  >
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
                        This subscription belongs to my business, and I authorize BotBound to screen
                        my marketing calls and texts against the registry with it.
                      </label>
                    </div>
                    {error ? (
                      <StatusNotice tone="destructive" className="sm:col-span-2" title={error} />
                    ) : null}
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button type="submit" size="sm" disabled={saving || !attest || !san.trim()}>
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
                </li>
              </ol>
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
