import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useLocation } from "react-router";
import { AUTH_SESSION_EXPIRED_EVENT, refreshSessionIfNeeded } from "../lib/api";
import { LEGACY_STORAGE_KEY } from "../lib/session-cookie";
import { isAuthPortalPath, isSessionOptionalPublicPath } from "../lib/public-routes";
import { clearStudioLastAgentId } from "../lib/studio-agent-preference";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  /** True when email matches OWNER_EMAIL / OWNER_EMAILS (platform owner perks). */
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
// Rotate the session cookie well within the 2h window while the tab is active,
// so a user working outside the streaming-chat surface isn't logged out
// mid-task. Throttled so rapid tab switches don't refresh repeatedly.
const SESSION_REFRESH_INTERVAL_MS = 25 * 60_000;
const SESSION_REFRESH_THROTTLE_MS = 5 * 60_000;

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
  try {
    for (const key of STALE_BROWSER_TOKEN_KEYS) localStorage.removeItem(key);
  } catch {
    // Cookie-based sessions remain usable when browser storage is blocked.
  }
}

function clearLegacySession(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Removing a retired cache must not prevent a confirmed session transition.
  }
}

async function migrateLegacyLocalStorage(): Promise<void> {
  clearStaleBrowserTokens();
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as { access_token?: string };
    if (!parsed.access_token) {
      clearLegacySession();
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SESSION_PROBE_MS);
    try {
      await fetch("/api/auth/migrate-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parsed.access_token}`,
        },
        credentials: "include",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    /* ignore — session hydrate will fail cleanly */
  } finally {
    clearLegacySession();
    clearStaleBrowserTokens();
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Legacy token migration is a one-way, best-effort POST with no durable
  // result to observe. Run it at most once per mounted session so navigating
  // between auth-portal routes does not re-issue it.
  const migratedRef = useRef(false);
  // Latest location for use inside the hydration effect without depending on
  // the raw pathname (which would re-fire on every intra-portal navigation).
  const locationRef = useRef(location);
  locationRef.current = location;

  // Whether the current path needs a session probe. Public marketing surfaces
  // do not; workspace and account-entry routes do. Depending on this boolean
  // (instead of the raw pathname) means intra-portal navigation between, say,
  // /signin and /signup no longer re-fires the hydration effect, while crossing
  // from a public page into the portal still hydrates once.
  const needsAuthProbe =
    !isSessionOptionalPublicPath(location.pathname) || isAuthPortalPath(location.pathname);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pathname = locationRef.current.pathname;
      const sessionOptional = isSessionOptionalPublicPath(pathname);
      if (user && session) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (sessionOptional) {
        // Public and account-entry routes must paint without waiting on the
        // session endpoint. Account-entry routes still hydrate in the
        // background, though: otherwise a signed-in customer who refreshed
        // /signin or /signup was rendered as anonymous forever and could start
        // a second account flow instead of returning to their workspace.
        if (!cancelled) setLoading(false);
        if (!isAuthPortalPath(pathname)) return;
      }

      if (!sessionOptional && !cancelled) setLoading(true);
      try {
        if (!migratedRef.current) {
          migratedRef.current = true;
          await migrateLegacyLocalStorage();
        }
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
  }, [needsAuthProbe, session, user]);

  useEffect(() => {
    const onSessionExpired = (_event: Event) => {
      clearLegacySession();
      clearStudioLastAgentId();
      setSession(null);
      setUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  // Keep an actively-used session alive. The refresh endpoint re-validates the
  // session before rotating, so an already-expired one still falls through to
  // the normal sign-out path rather than being silently extended.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!user) return;
    const maybeRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < SESSION_REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;
      void refreshSessionIfNeeded();
    };
    const interval = window.setInterval(maybeRefresh, SESSION_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [user]);

  const signIn = useCallback((newSession: Session) => {
    clearLegacySession();
    setSession({ user: newSession.user });
    setUser(newSession.user);
  }, []);

  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error("Sign-out did not complete. Please try again.");
    clearLegacySession();
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
