/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Phone, MapPin, Search, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { authFetch, readApiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface AvailableNumber {
  phone_number: string;
  area_code: string | null;
  region: string | null;
}

interface AreaCode {
  code: string;
  city: string;
  state: string;
}

interface PhoneNumberPickerProps {
  /** Optional agent id — when set, the claimed number gets attached to this agent. */
  agentId?: string;
  /** Callback after a number is successfully claimed. */
  onClaim?: (phoneNumber: string) => void;
  /** Optional label override; defaults to "Pick a phone number". */
  title?: string;
}

function formatE164(e164: string): string {
  // +15551234567 → (555) 123-4567
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default function PhoneNumberPicker({ agentId, onClaim, title }: PhoneNumberPickerProps) {
  const [available, setAvailable] = useState<AvailableNumber[]>([]);
  const [areaCodes, setAreaCodes] = useState<AreaCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventoryUnavailable, setInventoryUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchAreaCode, setSearchAreaCode] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    setInventoryUnavailable(false);
    try {
      const [availableResponse, areaCodesResponse] = await Promise.all([
        authFetch("/api/phone-numbers/available"),
        authFetch("/api/phone-numbers/area-codes"),
      ]);
      const [availableResult, areaCodesResult] = await Promise.all([
        readApiJson<{ available?: AvailableNumber[] }>(availableResponse),
        readApiJson<{ area_codes?: AreaCode[] }>(areaCodesResponse),
      ]);
      if (availableResult.ok === false) {
        throw new Error(
          availableResult.status === 503
            ? "Phone-number inventory is unavailable until the carrier connection is configured."
            : availableResult.error,
        );
      }
      setAvailable(availableResult.data.available || []);
      setAreaCodes(areaCodesResult.ok ? areaCodesResult.data.area_codes || [] : []);
    } catch (e: any) {
      setAvailable([]);
      setAreaCodes([]);
      setInventoryUnavailable(true);
      setError(e?.message || "Could not load available numbers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const claim = async (phoneNumber: string) => {
    setClaiming(phoneNumber);
    setError(null);
    try {
      const res = await authFetch("/api/phone-numbers/claim", {
        method: "POST",
        body: JSON.stringify({ phone_number: phoneNumber, agent_id: agentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not claim that number");
      }
      onClaim?.(phoneNumber);
    } catch (e: any) {
      setError(e?.message || "Claim failed");
      // Refresh in case the number was taken between list + claim
      await refresh();
    } finally {
      setClaiming(null);
    }
  };

  const searchByAreaCode = async () => {
    if (!/^\d{3}$/.test(searchAreaCode)) {
      setError("Enter a 3-digit US area code.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await authFetch("/api/phone-numbers/search", {
        method: "POST",
        body: JSON.stringify({ area_code: searchAreaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No numbers in that area code");
      }
      // Newly-bought number is now in the pool — refresh + auto-claim it
      await refresh();
      await claim(data.phone_number);
      setSearchAreaCode("");
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading available numbers
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl text-foreground leading-none">
            {title || "Pick a phone number"}
          </h3>
          <p className="text-[length:var(--wireline-typography-overline-size)] text-muted/70 mt-1.5">
            Each agent gets its own number so callers can reach it directly.
          </p>
        </div>
        <ShadButton
          type="button"
          variant="outline"
          size="icon"
          disableAnimations
          onClick={refresh}
          aria-label="Refresh available numbers"
          className="shrink-0 rounded-full border-border text-muted hover:text-brand hover:border-brand/40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </ShadButton>
      </div>

      {inventoryUnavailable ? (
        <div
          role="alert"
          className="rounded-xl border border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] p-5"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-[var(--wireline-color-status-warning)]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Number inventory unavailable</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{error}</p>
              <ShadButton
                type="button"
                variant="outline"
                size="sm"
                disableAnimations
                onClick={refresh}
                className="mt-3"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </ShadButton>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Available pool */}
          {available.length > 0 ? (
            <div>
              <p className="text-eyebrow/60 mb-2">Available now ({available.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {available.map((n) => (
                  <motion.button
                    key={n.phone_number}
                    type="button"
                    onClick={() => claim(n.phone_number)}
                    disabled={!!claiming}
                    whileHover={{ y: -1 }}
                    className={cn(
                      "text-left p-3.5 rounded-md wl-panel border transition-all flex items-center gap-3 group",
                      claiming === n.phone_number
                        ? "border-brand/40 bg-brand/5"
                        : "border-border hover:border-brand/40 hover:bg-brand/[0.03]",
                    )}
                  >
                    <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 wl-phone-number-icon">
                      {claiming === n.phone_number ? (
                        <Loader2 className="w-4 h-4 animate-spin text-brand" />
                      ) : (
                        <Phone className="w-4 h-4 text-brand" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-foreground font-medium leading-none">
                        {formatE164(n.phone_number)}
                      </p>
                      {n.region && (
                        <p className="wl-micro-meta--muted mt-1 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          {n.region}
                        </p>
                      )}
                    </div>
                    {claiming === n.phone_number && (
                      <span className="wl-label text-brand">Claiming…</span>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md wl-panel border border-border p-5 text-center">
              <p className="text-[length:var(--wireline-typography-caption-size)] text-muted">
                No numbers in pool right now. Search by area code below to find one.
              </p>
            </div>
          )}

          {/* Area-code search */}
          <div className="rounded-md border border-border bg-white/[0.02] p-4 space-y-3">
            <p className="text-eyebrow/60">Search by area code</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="e.g. 617 for Boston"
                  value={searchAreaCode}
                  onChange={(e) => setSearchAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchByAreaCode();
                  }}
                  className="w-full h-10 pl-9 pr-3 rounded-full wl-panel border border-border text-sm text-foreground placeholder:text-muted/70 focus:border-brand/40 focus:outline-none transition-all font-mono"
                />
              </div>
              <ShadButton
                type="button"
                disableAnimations
                onClick={searchByAreaCode}
                disabled={searching || searchAreaCode.length !== 3}
                className="shrink-0 h-10 rounded-full bg-gradient-to-r from-brand to-brand-deep px-5 text-on-brand text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Searching
                  </>
                ) : (
                  <>
                    <Phone className="w-3.5 h-3.5" />
                    Get number
                  </>
                )}
              </ShadButton>
            </div>
            {/* Popular codes as quick-fill chips */}
            {areaCodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {areaCodes.slice(0, 12).map((ac) => (
                  <ShadButton
                    key={`${ac.code}-${ac.city}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setSearchAreaCode(ac.code)}
                    className="h-auto rounded-full border-border bg-muted/10 px-2.5 py-1 wl-micro-meta--muted hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
                    title={`${ac.city}, ${ac.state}`}
                  >
                    <span className="font-mono">{ac.code}</span>
                    <span className="ml-1.5 opacity-60">{ac.city}</span>
                  </ShadButton>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {error && !inventoryUnavailable && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-start gap-2 p-3 rounded-md bg-destructive/8 border border-destructive/25"
          >
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-[length:var(--wireline-typography-overline-size)] text-destructive leading-relaxed">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
