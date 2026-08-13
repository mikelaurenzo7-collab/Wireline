/**
 * AccountContext — server-backed account state.
 *
 * Fetches the user's accounts from /api/accounts on mount and exposes:
 *   - accountType: the active account's type ("personal" | "business")
 *   - activeAccount: the full active account object
 *   - accounts: all accounts for the user
 *   - switchAccount / addAccount: mutations
 *
 * The active account is persisted in localStorage ("wl_active_account")
 * so page refreshes resume in the same workspace without a fetch.
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
import type { AccountType } from "../lib/account-type";
import { readStoredAccountId, storeActiveAccountId } from "../lib/active-account-storage";
import { useAuth } from "./AuthContext";

export interface Account {
  id: string;
  userId: string;
  type: AccountType;
  label: string | null;
  isPrimary: boolean;
}

interface AccountState {
  accountType: AccountType;
  activeAccount: Account | null;
  accounts: Account[];
  loading: boolean;
  switchAccount: (accountId: string) => void;
  addAccount: (type: AccountType, label?: string) => Promise<Account | null>;
  setAccountType: (type: AccountType | null) => void;
  planId: string | null;
  overridden: boolean;
}

const AccountContext = createContext<AccountState | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | null>(readStoredAccountId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await authFetch("/api/accounts");
        if (!r.ok || cancelled) return;
        const data = await r.json();
        const fetched = (data?.accounts ?? []) as Account[];
        if (!cancelled) {
          setAccounts(fetched);
          // Re-seed when nothing is stored OR the stored id is not one of this
          // user's accounts (a previous user's selection, or a deleted account) —
          // otherwise the stale id silently falls back to accounts[0] forever.
          const stillValid = Boolean(activeId && fetched.some((a) => a.id === activeId));
          if (!stillValid && fetched.length > 0) {
            const primary = fetched.find((a) => a.isPrimary) ?? fetched[0];
            setActiveId(primary.id);
            storeActiveAccountId(primary.id);
          }
        }
      } catch {
        /* API might not be ready yet — fallback to localStorage */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null,
    [accounts, activeId],
  );

  const accountType: AccountType = activeAccount?.type ?? "personal";

  const switchAccount = useCallback((accountId: string) => {
    setActiveId(accountId);
    storeActiveAccountId(accountId);
  }, []);

  const addAccount = useCallback(
    async (type: AccountType, label?: string): Promise<Account | null> => {
      try {
        const r = await authFetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, label }),
        });
        if (!r.ok) return null;
        const data = await r.json();
        const created = data.account as Account;
        setAccounts((prev) => [...prev, created]);
        switchAccount(created.id);
        return created;
      } catch {
        return null;
      }
    },
    [switchAccount],
  );

  const setAccountType = useCallback(
    (type: AccountType | null) => {
      if (!type) return;
      const target = accounts.find((a) => a.type === type);
      if (target) switchAccount(target.id);
    },
    [accounts, switchAccount],
  );

  const value = useMemo(
    () => ({
      accountType,
      activeAccount,
      accounts,
      loading,
      switchAccount,
      addAccount,
      setAccountType,
      planId: null,
      overridden: false,
    }),
    [accountType, activeAccount, accounts, loading, switchAccount, addAccount, setAccountType],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    return {
      accountType: "personal",
      activeAccount: null,
      accounts: [],
      loading: false,
      switchAccount: () => {},
      addAccount: async () => null,
      setAccountType: () => {},
      planId: null,
      overridden: false,
    };
  }
  return ctx;
}
