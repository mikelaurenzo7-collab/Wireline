import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AUTH_SESSION_EXPIRED_EVENT } from "../lib/api";
import { LEGACY_STORAGE_KEY } from "../lib/session-cookie";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  /** True only for the platform owner (email matches OWNER_EMAIL). Gates the Founder's Dashboard. */
  is_owner?: boolean;
}

export interface Session {
  user: User;
  /** @deprecated Tokens live in httpOnly cookies; not persisted client-side. */
  access_token?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (session: Session) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  signIn: () => {},
});

const SESSION_PROBE_MS = 8_000;

async function fetchSessionUser(): Promise<User | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SESSION_PROBE_MS);
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: User };
    return data.user ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function migrateLegacyLocalStorage(): Promise<void> {
  const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored) as { access_token?: string };
    if (!parsed.access_token) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    await fetch("/api/auth/migrate-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parsed.access_token}`,
      },
      credentials: "include",
    });
  } catch {
    /* ignore — session hydrate will fail cleanly */
  } finally {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacyLocalStorage();
        const hydrated = await fetchSessionUser();
        if (!cancelled && hydrated) {
          setUser(hydrated);
          setSession({ user: hydrated });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onSessionExpired = (_event: Event) => {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      setSession(null);
      setUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const signIn = useCallback((newSession: Session) => {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setSession({ user: newSession.user });
    setUser(newSession.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch {
      /* still clear local state */
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setSession(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, signIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
