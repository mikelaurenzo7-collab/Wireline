import { useEffect, useState } from "react";
import { Check, Copy, Phone, Smartphone } from "lucide-react";

import { formatPhone } from "../../lib/safe-number";

/**
 * "Call your Bot" that works on every device. Phones get a tel: link; desktops
 * (where tel: usually does nothing) get the number, a copy button and a
 * "call from your phone" prompt.
 */
export function canDialFromThisDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || "");
    return coarse && mobileUa;
  } catch {
    return false;
  }
}

export default function TestCallLink({
  phone,
  label = "Test call",
}: {
  phone: string;
  label?: string;
}) {
  const [mobile, setMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setMobile(canDialFromThisDevice()), []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const display = formatPhone(phone);
  const dial = phone.replace(/[ ().-]/g, "");

  if (mobile)
    return (
      <a
        href={`tel:${dial}`}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo sm:w-auto"
      >
        <Phone className="size-4" aria-hidden="true" />
        {label}: dial {display}
      </a>
    );

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
      data-testid="test-call-desktop"
    >
      <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-foreground">
        {label}: call <strong className="tabular-nums">{display}</strong> from your phone
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(dial)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
        aria-label={`Copy ${display}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo"
      >
        {copied ? (
          <Check className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy number"}
      </button>
    </div>
  );
}
