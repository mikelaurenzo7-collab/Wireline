/**
 * AccountContext — derives the Personal vs Business account mode once and shares
 * it across the authed app, so navigation and (later) onboarding/home all read
 * a single source instead of each re-fetching the plan.
 *
 * Resolution order:
 *   1. An explicit override (the mode switcher, or a `?account=personal|business`
 *      preview link), persisted in localStorage.
 *   2. Otherwise derived from the billing plan (`/api/billing/usage`) via
 *      resolveAccountType — only the "personal" tier is a personal account.
 *
 * Slice 1 persists the override client-side. A server-backed account_type +
 * onboarding choice is a deliberate follow-up; this module's shape stays the
 * same when that lands (only the source of `planId`/override moves server-side).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authFetch } from "../lib/api";
import { resolveAccountType, type AccountType } from "../lib/account-type";

const STORAGE_KEY = "wl_account_mode";

interface AccountState {
  /** The effective mode: explicit override if set, else derived from plan. */
  accountType: AccountType;
  /** The raw billing plan id, once loaded. */
  planId: string | null;
  /** True while the plan is still being fetched. */
  loading: boolean;
  /** True when the mode was explicitly chosen (switcher/preview), not derived. */
  overridden: boolean;
  /** Set an explicit mode (persisted), or pass null to clear and derive from plan. */
  setAccountType: (type: AccountType | null) => void;
}

const AccountContext = createContext<AccountState | undefined>(undefined);

function readStoredOverride(): AccountType | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "personal" || v === "business" ? v : null;
  } catch {
    return null;
  }
}

/** One-time read of a `?account=personal|business` preview param, then strip it. */
function readUrlOverride(): AccountType | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("account");
    if (v !== "personal" && v !== "business") return null;
    params.delete("account");
    const qs = params.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(window.history.state, "", next);
    return v;
  } catch {
    return null;
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<AccountType | null>(
    () => readUrlOverride() ?? readStoredOverride(),
  );

  // Persist any URL-driven override discovered on first render.
  useEffect(() => {
    if (!override) return;
    try {
      localStorage.setItem(STORAGE_KEY, override);
    } catch {
      /* non-fatal */
    }
    // Only on mount-resolved override; setAccountType handles later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch("/api/billing/usage");
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (!cancelled) setPlanId((data?.plan_id as string) ?? null);
      } catch {
        /* derive() falls back to business */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAccountType = useCallback((type: AccountType | null) => {
    setOverride(type);
    try {
      if (type) localStorage.setItem(STORAGE_KEY, type);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* non-fatal */
    }
  }, []);

  const accountType = override ?? resolveAccountType(planId);

  const value = useMemo(
    () => ({ accountType, planId, loading, overridden: override !== null, setAccountType }),
    [accountType, planId, loading, override, setAccountType],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/**
 * Read the account mode. Returns a safe business default when used outside the
 * provider (e.g. isolated component tests), so nav components never crash.
 */
export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    return {
      accountType: "business",
      planId: null,
      loading: false,
      overridden: false,
      setAccountType: () => {},
    };
  }
  return ctx;
}
