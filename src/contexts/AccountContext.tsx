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
import { useAuth } from "./AuthContext";

const STORAGE_KEY_PREFIX = "wl_active_account";

function storageKeyForUser(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

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

function readStoredAccountId(userId: string): string | null {
  try {
    return localStorage.getItem(storageKeyForUser(userId));
  } catch {
    return null;
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAccounts([]);
      setActiveId(null);
      setLoading(false);
      return;
    }

    // Resume this user's saved workspace; never inherit another user's account
    // id from the unscoped global key or a previous session on a shared browser.
    setActiveId(readStoredAccountId(user.id));

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
          const stored = readStoredAccountId(user.id);
          const primary: Account | undefined =
            (stored && fetched.find((a) => a.id === stored)) ||
            fetched.find((a) => a.isPrimary) ||
            fetched[0];
          if (primary) {
            setActiveId(primary.id);
            try {
              localStorage.setItem(storageKeyForUser(user.id), primary.id);
            } catch {
              /* non-fatal */
            }
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
  }, [user]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null,
    [accounts, activeId],
  );

  const accountType: AccountType = activeAccount?.type ?? "personal";

  const switchAccount = useCallback(
    (accountId: string) => {
      setActiveId(accountId);
      if (user) {
        try {
          localStorage.setItem(storageKeyForUser(user.id), accountId);
        } catch {
          /* non-fatal */
        }
      }
    },
    [user],
  );

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
