type BillingInterval = "month" | "year";

/** One responsive interval picker for public pricing and account billing. */
export default function BillingIntervalControl({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}) {
  return (
    <div className="wl-billing-interval" role="group" aria-label="Billing interval">
      {(["month", "year"] as const).map((interval) => (
        <button
          key={interval}
          type="button"
          aria-pressed={value === interval}
          onClick={() => onChange(interval)}
          className="wl-focus-ring-halo"
        >
          {interval === "month" ? "Monthly" : "Annual"}
        </button>
      ))}
    </div>
  );
}
