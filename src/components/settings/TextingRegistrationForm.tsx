import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

import { authFetch } from "../../lib/api";
import { Button, Input, NativeSelect } from "../atoms";
import { StatusNotice } from "../molecules";

type Flow = "business" | "sole_proprietor";

type Address = { street: string; city: string; region: string; postalCode: string };

type BusinessForm = {
  legalName: string;
  brandName: string;
  businessType: string;
  industry: string;
  ein: string;
  websiteUrl: string;
  privacyUrl: string;
  termsUrl: string;
  address: Address;
  representative: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    businessTitle: string;
    jobPosition: string;
  };
};

type SoleForm = {
  brandName: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  vertical: string;
  address: Address;
  websiteUrl: string;
};

type RegistrationResponse = {
  status: "needs_details" | "received";
  flow: Flow | null;
  summary: { brandName: string; einLastFour: string | null } | null;
  details: Record<string, unknown> | null;
  submitted_at: string | null;
  default_brand_name: string | null;
  options: {
    businessTypes: string[];
    industries: string[];
    verticals: string[];
    jobPositions: string[];
  };
};

const EMPTY_ADDRESS: Address = { street: "", city: "", region: "", postalCode: "" };

const EMPTY_BUSINESS: BusinessForm = {
  legalName: "",
  brandName: "",
  businessType: "",
  industry: "",
  ein: "",
  websiteUrl: "",
  privacyUrl: "",
  termsUrl: "",
  address: EMPTY_ADDRESS,
  representative: {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    businessTitle: "",
    jobPosition: "",
  },
};

const EMPTY_SOLE: SoleForm = {
  brandName: "",
  firstName: "",
  lastName: "",
  email: "",
  mobilePhone: "",
  vertical: "",
  address: EMPTY_ADDRESS,
  websiteUrl: "",
};

/** "PROFESSIONAL_SERVICES" reads as "Professional services". */
export function carrierCodeLabel(code: string): string {
  const words = code.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function addressOf(value: unknown): Address {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    street: textOf(raw.street),
    city: textOf(raw.city),
    region: textOf(raw.region),
    postalCode: textOf(raw.postalCode),
  };
}

function businessFrom(details: Record<string, unknown>): BusinessForm {
  const rep =
    details.representative && typeof details.representative === "object"
      ? (details.representative as Record<string, unknown>)
      : {};
  return {
    legalName: textOf(details.legalName),
    brandName: textOf(details.brandName),
    businessType: textOf(details.businessType),
    industry: textOf(details.industry),
    ein: "",
    websiteUrl: textOf(details.websiteUrl),
    privacyUrl: textOf(details.privacyUrl),
    termsUrl: textOf(details.termsUrl),
    address: addressOf(details.address),
    representative: {
      firstName: textOf(rep.firstName),
      lastName: textOf(rep.lastName),
      email: textOf(rep.email),
      phone: textOf(rep.phone),
      businessTitle: textOf(rep.businessTitle),
      jobPosition: textOf(rep.jobPosition),
    },
  };
}

function soleFrom(details: Record<string, unknown>): SoleForm {
  return {
    brandName: textOf(details.brandName),
    firstName: textOf(details.firstName),
    lastName: textOf(details.lastName),
    email: textOf(details.email),
    mobilePhone: textOf(details.mobilePhone),
    vertical: textOf(details.vertical),
    address: addressOf(details.address),
    websiteUrl: textOf(details.websiteUrl),
  };
}

/** What the owner sees after saving, in plain words. */
export function textingRegistrationReceivedCopy(flow: Flow | null): string {
  const base =
    "Details received. BotBound submits them to US carriers and covers the registration fees. Approval usually takes a few days to two weeks, and texts from your line turn on once it's approved.";
  return flow === "sole_proprietor"
    ? `${base} Carriers will text your cell phone once from 915-278-2000: reply YES within 24 hours.`
    : base;
}

/**
 * A labelled control with an optional hint. The hint sits outside the label so
 * it is announced once, as a description, not as part of the field's name.
 */
function Field(props: {
  label: string;
  hint?: string;
  className?: string;
  children: (ids: { describedBy?: string }) => ReactNode;
}) {
  const hintId = useId();
  return (
    <div className={`grid content-start gap-1.5 ${props.className ?? ""}`}>
      <label className="grid gap-1.5 text-xs font-medium text-foreground">
        {props.label}
        {props.children({ describedBy: props.hint ? hintId : undefined })}
      </label>
      {props.hint ? (
        <span id={hintId} className="text-xs leading-4 text-muted-foreground">
          {props.hint}
        </span>
      ) : null}
    </div>
  );
}

function AddressFields(props: { value: Address; onChange: (next: Address) => void }) {
  const set = (key: keyof Address) => (event: { target: { value: string } }) =>
    props.onChange({ ...props.value, [key]: event.target.value });
  return (
    <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-6">
      <legend className="mb-2 text-xs font-semibold text-foreground">Business address</legend>
      <Field label="Street" className="sm:col-span-6">
        {() => (
          <Input
            value={props.value.street}
            onChange={set("street")}
            autoComplete="address-line1"
            maxLength={200}
            required
          />
        )}
      </Field>
      <Field label="City" className="sm:col-span-3">
        {() => (
          <Input
            value={props.value.city}
            onChange={set("city")}
            autoComplete="address-level2"
            required
          />
        )}
      </Field>
      <Field label="State" hint="Two letters" className="sm:col-span-1">
        {({ describedBy }) => (
          <Input
            value={props.value.region}
            onChange={(event) =>
              props.onChange({ ...props.value, region: event.target.value.toUpperCase() })
            }
            autoComplete="address-level1"
            aria-describedby={describedBy}
            maxLength={2}
            required
          />
        )}
      </Field>
      <Field label="ZIP code" className="sm:col-span-2">
        {() => (
          <Input
            value={props.value.postalCode}
            onChange={set("postalCode")}
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
            required
          />
        )}
      </Field>
    </fieldset>
  );
}

/**
 * Lines → Texting registration. The owner gives their business details once;
 * BotBound registers the line with US carriers (and absorbs the fees). Saving
 * never contacts a carrier or spends money; the line's texting status in Lines
 * shows when carriers approve it.
 */
export default function TextingRegistrationForm() {
  const [state, setState] = useState<RegistrationResponse | null>(null);
  const [flow, setFlow] = useState<Flow>("business");
  const [business, setBusiness] = useState<BusinessForm>(EMPTY_BUSINESS);
  const [sole, setSole] = useState<SoleForm>(EMPTY_SOLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((body: RegistrationResponse) => {
    setState(body);
    const fallbackBrand = body.default_brand_name ?? "";
    if (body.flow) setFlow(body.flow);
    setBusiness(
      body.flow === "business" && body.details
        ? businessFrom(body.details)
        : { ...EMPTY_BUSINESS, brandName: fallbackBrand },
    );
    setSole(
      body.flow === "sole_proprietor" && body.details
        ? soleFrom(body.details)
        : { ...EMPTY_SOLE, brandName: fallbackBrand },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/texting-registration");
      const body = (await response.json().catch(() => null)) as RegistrationResponse | null;
      if (!response.ok || !body || !body.options) throw new Error("load");
      apply(body);
    } catch {
      setError("Texting registration is unavailable right now. Your saved details are unchanged.");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setProblems([]);
    setError(null);
    try {
      const response = await authFetch("/api/texting-registration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow, details: flow === "business" ? business : sole }),
      });
      const body = (await response.json().catch(() => null)) as
        (RegistrationResponse & { error?: string; details?: { problems?: string[] } }) | null;
      if (!response.ok) {
        const listed = body?.details?.problems;
        if (Array.isArray(listed) && listed.length > 0) setProblems(listed);
        else setError(body?.error || "Your details weren't saved. Try again.");
        return;
      }
      if (body) apply(body);
      setSaved(true);
    } catch {
      setError("Your details weren't saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      const response = await authFetch("/api/texting-registration", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as RegistrationResponse | null;
      if (!response.ok || !body) throw new Error("remove");
      apply(body);
      setFlow("business");
      setSaved(false);
      setConfirmingRemove(false);
    } catch {
      setError("Your details weren't removed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading texting registration…</p>;
  }
  if (!state) {
    return (
      <StatusNotice
        tone="destructive"
        title="Texting Registration Unavailable"
        action={
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            Try Again
          </Button>
        }
      >
        {error}
      </StatusNotice>
    );
  }

  const options = state.options;
  const received = state.status === "received";
  const setRep = (key: keyof BusinessForm["representative"], value: string) =>
    setBusiness((current) => ({
      ...current,
      representative: { ...current.representative, [key]: value },
    }));

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="max-w-prose text-sm leading-6 text-muted-foreground">
        US carriers approve texts from a business only after they know who is sending. Enter your
        details once; it takes about three minutes. BotBound registers your line and covers the
        carrier fees.
      </p>

      {received && !saved ? (
        <StatusNotice tone="info" title="Details Received" data-texting-registration="received">
          {textingRegistrationReceivedCopy(state.flow)}
        </StatusNotice>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-foreground">Your business</legend>
        {(
          [
            ["business", "My business has an EIN"],
            ["sole_proprietor", "I'm a sole proprietor without an EIN"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
            <input
              type="radio"
              name="texting-registration-flow"
              value={value}
              checked={flow === value}
              onChange={() => setFlow(value)}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {flow === "business" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal business name" hint="Exactly as on your IRS records for this EIN.">
            {({ describedBy }) => (
              <Input
                value={business.legalName}
                onChange={(event) => setBusiness({ ...business, legalName: event.target.value })}
                autoComplete="organization"
                aria-describedby={describedBy}
                maxLength={120}
                required
              />
            )}
          </Field>
          <Field label="Brand name" hint="Texts start with this name.">
            {({ describedBy }) => (
              <Input
                value={business.brandName}
                onChange={(event) => setBusiness({ ...business, brandName: event.target.value })}
                aria-describedby={describedBy}
                maxLength={60}
                required
              />
            )}
          </Field>
          <Field label="Business type">
            {() => (
              <NativeSelect
                value={business.businessType}
                onChange={(event) => setBusiness({ ...business, businessType: event.target.value })}
                required
              >
                <option value="">Choose one</option>
                {options.businessTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Industry">
            {() => (
              <NativeSelect
                value={business.industry}
                onChange={(event) => setBusiness({ ...business, industry: event.target.value })}
                required
              >
                <option value="">Choose one</option>
                {options.industries.map((code) => (
                  <option key={code} value={code}>
                    {carrierCodeLabel(code)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field
            label="EIN"
            hint={
              state.summary?.einLastFour && state.flow === "business"
                ? `On file, ending ${state.summary.einLastFour}. Leave blank to keep it.`
                : "Nine digits. Stored encrypted."
            }
          >
            {({ describedBy }) => (
              <Input
                value={business.ein}
                onChange={(event) => setBusiness({ ...business, ein: event.target.value })}
                aria-describedby={describedBy}
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                required={!(state.summary?.einLastFour && state.flow === "business")}
              />
            )}
          </Field>
          <Field label="Website">
            {() => (
              <Input
                type="url"
                value={business.websiteUrl}
                onChange={(event) => setBusiness({ ...business, websiteUrl: event.target.value })}
                autoComplete="url"
                placeholder="https://"
                required
              />
            )}
          </Field>
          <Field
            label="Privacy policy page"
            className="sm:col-span-2"
            hint="Carriers check that it says you never share mobile numbers or texting consent."
          >
            {({ describedBy }) => (
              <Input
                type="url"
                value={business.privacyUrl}
                onChange={(event) => setBusiness({ ...business, privacyUrl: event.target.value })}
                aria-describedby={describedBy}
                placeholder="https://"
                required
              />
            )}
          </Field>
          <Field
            label="Terms of service page"
            className="sm:col-span-2"
            hint="Carriers now require it alongside the privacy policy."
          >
            {({ describedBy }) => (
              <Input
                type="url"
                value={business.termsUrl}
                onChange={(event) => setBusiness({ ...business, termsUrl: event.target.value })}
                aria-describedby={describedBy}
                placeholder="https://"
                required
              />
            )}
          </Field>
          <AddressFields
            value={business.address}
            onChange={(address) => setBusiness({ ...business, address })}
          />
          <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold text-foreground">
              Authorized representative
            </legend>
            <Field label="First name">
              {() => (
                <Input
                  value={business.representative.firstName}
                  onChange={(event) => setRep("firstName", event.target.value)}
                  autoComplete="given-name"
                  required
                />
              )}
            </Field>
            <Field label="Last name">
              {() => (
                <Input
                  value={business.representative.lastName}
                  onChange={(event) => setRep("lastName", event.target.value)}
                  autoComplete="family-name"
                  required
                />
              )}
            </Field>
            <Field label="Email">
              {() => (
                <Input
                  type="email"
                  value={business.representative.email}
                  onChange={(event) => setRep("email", event.target.value)}
                  autoComplete="email"
                  required
                />
              )}
            </Field>
            <Field label="Phone">
              {() => (
                <Input
                  type="tel"
                  value={business.representative.phone}
                  onChange={(event) => setRep("phone", event.target.value)}
                  autoComplete="tel"
                  required
                />
              )}
            </Field>
            <Field label="Title">
              {() => (
                <Input
                  value={business.representative.businessTitle}
                  onChange={(event) => setRep("businessTitle", event.target.value)}
                  autoComplete="organization-title"
                  required
                />
              )}
            </Field>
            <Field label="Role" hint="Owners usually choose CEO.">
              {({ describedBy }) => (
                <NativeSelect
                  value={business.representative.jobPosition}
                  onChange={(event) => setRep("jobPosition", event.target.value)}
                  aria-describedby={describedBy}
                  required
                >
                  <option value="">Choose one</option>
                  {options.jobPositions.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </fieldset>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand name" hint="Texts start with this name, often your own name.">
            {({ describedBy }) => (
              <Input
                value={sole.brandName}
                onChange={(event) => setSole({ ...sole, brandName: event.target.value })}
                aria-describedby={describedBy}
                maxLength={60}
                required
              />
            )}
          </Field>
          <Field label="Kind of work">
            {() => (
              <NativeSelect
                value={sole.vertical}
                onChange={(event) => setSole({ ...sole, vertical: event.target.value })}
                required
              >
                <option value="">Choose one</option>
                {options.verticals.map((code) => (
                  <option key={code} value={code}>
                    {carrierCodeLabel(code)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="First name">
            {() => (
              <Input
                value={sole.firstName}
                onChange={(event) => setSole({ ...sole, firstName: event.target.value })}
                autoComplete="given-name"
                required
              />
            )}
          </Field>
          <Field label="Last name">
            {() => (
              <Input
                value={sole.lastName}
                onChange={(event) => setSole({ ...sole, lastName: event.target.value })}
                autoComplete="family-name"
                required
              />
            )}
          </Field>
          <Field label="Email">
            {() => (
              <Input
                type="email"
                value={sole.email}
                onChange={(event) => setSole({ ...sole, email: event.target.value })}
                autoComplete="email"
                required
              />
            )}
          </Field>
          <Field
            label="Your cell phone"
            hint="Carriers text it once to confirm; reply YES within 24 hours. Not your BotBound line."
          >
            {({ describedBy }) => (
              <Input
                type="tel"
                value={sole.mobilePhone}
                onChange={(event) => setSole({ ...sole, mobilePhone: event.target.value })}
                aria-describedby={describedBy}
                autoComplete="tel"
                required
              />
            )}
          </Field>
          <AddressFields
            value={sole.address}
            onChange={(address) => setSole({ ...sole, address })}
          />
          <Field label="Website (optional)" className="sm:col-span-2">
            {() => (
              <Input
                type="url"
                value={sole.websiteUrl}
                onChange={(event) => setSole({ ...sole, websiteUrl: event.target.value })}
                autoComplete="url"
                placeholder="https://"
              />
            )}
          </Field>
        </div>
      )}

      {problems.length > 0 ? (
        <StatusNotice tone="destructive" title="A Few Details Need a Fix" role="alert">
          <ul className="list-disc pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Not Saved" role="alert">
          {error}
        </StatusNotice>
      ) : null}
      {saved ? (
        <StatusNotice tone="success" title="Details Saved" role="status">
          {textingRegistrationReceivedCopy(flow)}
        </StatusNotice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : received ? "Save changes" : "Save business details"}
        </Button>
        {received ? (
          confirmingRemove ? (
            <>
              <span className="text-xs text-muted-foreground">
                Remove your saved details? Registration stops until you add them again.
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void remove()}
              >
                Remove details
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingRemove(false)}
              >
                Keep them
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingRemove(true)}
            >
              Remove details
            </Button>
          )
        ) : null}
      </div>
    </form>
  );
}
