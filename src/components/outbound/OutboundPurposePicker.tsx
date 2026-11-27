import {
  CONTACT_PERMISSION_LABEL,
  NONSALES_CONFIRMATION_LABEL,
  SALES_DNC_ATTESTATION_LABEL,
  firstNonSalesContactLabel,
} from "../../lib/outbound-compliance-copy";
import { SALES_CONTENT_WARNING } from "../../lib/outbound-call-purpose";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { Link } from "react-router";

export const OUTBOUND_PURPOSE_CHOICES = [
  { id: "personal", label: "Personal" },
  { id: "returning_contact", label: "Returning their call" },
  { id: "appointment_service", label: "Appointment/service" },
  { id: "existing_customer", label: "Existing customer" },
  { id: "callback", label: "Requested callback" },
  { id: "sales", label: "Sales" },
] as const;

export type OutboundPurposeChoice = (typeof OUTBOUND_PURPOSE_CHOICES)[number]["id"];

type OutboundPurposePickerProps = {
  purpose: OutboundPurposeChoice;
  onPurpose: (purpose: OutboundPurposeChoice) => void;
  relationship: boolean;
  customerSince: string;
  onCustomerSince: (value: string) => void;
  showPermission: boolean;
  permissionChecked: boolean;
  onPermission: (checked: boolean) => void;
  showNonsales: boolean;
  nonsalesChecked: boolean;
  onNonsales: (checked: boolean) => void;
  contentWarning?: string | null;
  disabled?: boolean;
  /** Locks the purpose chips. Permission checkboxes stay usable. */
  purposeLocked?: boolean;
  /** Replaces the purpose chips with the human label of a prepared call. */
  lockedPurposeLabel?: string;
  permissionLabel?: string;
  channel?: "call" | "sms";
};

export default function OutboundPurposePicker({
  purpose,
  onPurpose,
  relationship,
  customerSince,
  onCustomerSince,
  showPermission,
  permissionChecked,
  onPermission,
  showNonsales,
  nonsalesChecked,
  onNonsales,
  contentWarning,
  disabled,
  purposeLocked,
  lockedPurposeLabel,
  permissionLabel = CONTACT_PERMISSION_LABEL,
  channel = "sms",
}: OutboundPurposePickerProps) {
  return (
    <div className="space-y-3">
      <div>
        <span className="block text-sm font-semibold text-foreground">
          Why are you contacting them?
        </span>
        {lockedPurposeLabel ? (
          <p className="mt-2 text-sm text-foreground">{lockedPurposeLabel}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {OUTBOUND_PURPOSE_CHOICES.filter(
              (choice) => channel === "call" || choice.id !== "callback",
            ).map((choice) => {
              const lockedSales = channel === "sms" && relationship && choice.id === "sales";
              const selected = purpose === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={disabled || purposeLocked || lockedSales}
                  aria-pressed={selected}
                  onClick={() => onPurpose(choice.id)}
                  className={`min-h-11 rounded-full border px-3 text-sm ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  } ${lockedSales ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        )}
        {relationship ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {channel === "call"
              ? "They contacted you in the last 90 days. Choose the reason for this call."
              : purpose === "returning_contact"
                ? "They contacted you in the last 90 days, so Returning their call is selected."
                : "They contacted you in the last 90 days."}
          </p>
        ) : null}
      </div>
      {purpose === "callback" && !lockedPurposeLabel ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Choose this when the person specifically asked you to call them again.
        </p>
      ) : null}
      {purpose === "existing_customer" ? (
        <label className="block space-y-1.5">
          <span className="block text-sm font-semibold text-foreground">
            Approximate last purchase or service
          </span>
          <input
            type="date"
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={customerSince}
            disabled={disabled || purposeLocked}
            onChange={(event) => onCustomerSince(event.target.value)}
          />
        </label>
      ) : null}
      {showPermission && showNonsales ? (
        <label className="flex items-start gap-2 text-sm leading-5 text-foreground">
          <Checkbox
            className="mt-0.5"
            checked={permissionChecked && nonsalesChecked}
            disabled={disabled}
            onChange={(event) => {
              onPermission(event.target.checked);
              onNonsales(event.target.checked);
            }}
          />
          <span>{firstNonSalesContactLabel(channel)}</span>
        </label>
      ) : null}
      {showPermission && !showNonsales ? (
        <label className="flex items-start gap-2 text-sm leading-5 text-foreground">
          <Checkbox
            className="mt-0.5"
            checked={permissionChecked}
            disabled={disabled}
            onChange={(event) => onPermission(event.target.checked)}
          />
          <span>{permissionLabel}</span>
        </label>
      ) : null}
      {showNonsales && !showPermission ? (
        <label className="flex items-start gap-2 text-sm leading-5 text-foreground">
          <Checkbox
            className="mt-0.5"
            checked={nonsalesChecked}
            disabled={disabled}
            onChange={(event) => onNonsales(event.target.checked)}
          />
          <span>{NONSALES_CONFIRMATION_LABEL}</span>
        </label>
      ) : null}
      {showPermission || showNonsales ? (
        <p className="text-xs leading-5 text-muted-foreground">
          We remember this for this number and check opt-outs before each contact.
        </p>
      ) : null}
      {contentWarning ? (
        <p className="text-sm text-foreground" role="status">
          {contentWarning || SALES_CONTENT_WARNING}
        </p>
      ) : null}
    </div>
  );
}

export function SalesAttestationCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm leading-5 text-foreground">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {SALES_DNC_ATTESTATION_LABEL}{" "}
        <Link to="/terms#calls-texts-and-do-not-call" className="underline">
          Read the calls and texts terms
        </Link>
        .
      </span>
    </label>
  );
}
