import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { AUTH_SESSION_EXPIRED_EVENT } from "../lib/api";
import { LEGACY_STORAGE_KEY } from "../lib/session-cookie";
import { isSessionOptionalPublicPath } from "../lib/public-routes";
import { clearStudioLastAgentId } from "../lib/studio-agent-preference";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  /** True when email matches OWNER_EMAIL / OWNER_EMAILS (platform owner perks). */
  is_owner?: boolean;
  /** True only for founder-approved cockpit operators — stricter than is_owner. */
  founder_cockpit?: boolean;
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

const SESSION_OPTIONAL_ROUTE_PREFIXES = ["/solutions/", "/for/"];
const SESSION_OPTIONAL_ROUTES = new Set([
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/about",
  "/blog",
  "/security",
  "/trust",
  "/status",
  "/support",
  "/contact",
  "/privacy",
  "/terms",
  "/get-started",
]);

function shouldSkipSessionBootstrap(pathname: string): boolean {
  if (SESSION_OPTIONAL_ROUTES.has(pathname)) return true;
  return SESSION_OPTIONAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

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

const STALE_BROWSER_TOKEN_KEYS = ["wireline_token"];

function clearStaleBrowserTokens(): void {
  for (const key of STALE_BROWSER_TOKEN_KEYS) localStorage.removeItem(key);
}

async function migrateLegacyLocalStorage(): Promise<void> {
  clearStaleBrowserTokens();
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
    clearStaleBrowserTokens();
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionOptional = isSessionOptionalPublicPath(location.pathname);
      if (sessionOptional || (user && session)) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setLoading(true);
      try {
        const pathname = typeof window === "undefined" ? "/" : window.location.pathname || "/";
        if (shouldSkipSessionBootstrap(pathname)) return;
        await migrateLegacyLocalStorage();
        const hydrated = await fetchSessionUser();
        if (!cancelled) {
          if (hydrated) {
            setUser(hydrated);
            setSession({ user: hydrated });
          } else {
            setUser(null);
            setSession(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, session, user]);

  useEffect(() => {
    const onSessionExpired = (_event: Event) => {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      clearStudioLastAgentId();
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
    clearStudioLastAgentId();
    setSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, signOut, signIn }),
    [user, session, loading, signOut, signIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
