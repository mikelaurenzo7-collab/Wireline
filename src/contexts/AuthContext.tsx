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
import {
  setCreateBriefRecoveryOwner,
  suspendCreateBriefRecovery,
} from "../lib/create-brief-recovery";

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

export interface SignOutOptions {
  requireServerConfirmation?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** The session probe failed. The cookie may still be valid, so this is not anonymous. */
  sessionUnavailable: boolean;
  retrySessionProbe: () => void;
  signOut: (options?: SignOutOptions) => Promise<void>;
  signIn: (session: Session) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  sessionUnavailable: false,
  retrySessionProbe: () => {},
  signOut: async () => {},
  signIn: () => {},
});

const SESSION_PROBE_MS = 8_000;
// Rotate the session cookie well within the 2h window while the tab is active,
// so a user working outside the streaming-chat surface isn't logged out
// mid-task. Throttled so rapid tab switches don't refresh repeatedly.
const SESSION_REFRESH_INTERVAL_MS = 25 * 60_000;
const SESSION_REFRESH_THROTTLE_MS = 5 * 60_000;

const ACCOUNT_DELETION_NOTICE_KEY = "wireline_auth_notice";

type SessionProbe =
  | { status: "user"; user: User }
  | { status: "anonymous" }
  | { status: "unavailable" }
  | { status: "deleted" };

async function fetchSessionUser(): Promise<SessionProbe> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SESSION_PROBE_MS);
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "include",
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return { status: "anonymous" };
    const data = (await res.json().catch(() => null)) as {
      user?: User | null;
      code?: string;
      error?: string;
    } | null;
    if (res.status === 410 && data?.code === "ACCOUNT_DELETION_IN_PROGRESS") {
      return { status: "deleted" };
    }
    if (!res.ok) return { status: "unavailable" };
    if (data?.user === null) return { status: "anonymous" };
    return typeof data?.user?.id === "string" && data.user.id
      ? { status: "user", user: data.user }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeoutId);
  }
}

const STALE_BROWSER_TOKEN_KEYS = ["wireline_token"];

function removeStoredToken(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Legacy browser storage is optional; cookie authentication must continue.
  }
}

function clearStaleBrowserTokens(): void {
  for (const key of STALE_BROWSER_TOKEN_KEYS) removeStoredToken(key);
}

async function migrateLegacyLocalStorage(): Promise<void> {
  clearStaleBrowserTokens();
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as { access_token?: string };
    if (!parsed.access_token) return;
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
    // A missing or blocked legacy store must not prevent the cookie session probe.
  } finally {
    removeStoredToken(LEGACY_STORAGE_KEY);
    clearStaleBrowserTokens();
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [probeAttempt, setProbeAttempt] = useState(0);
  // Legacy token migration is a one-way, best-effort POST with no durable
  // result to observe. Run it at most once per mounted session so navigating
  // between auth-portal routes does not re-issue it.
  const migratedRef = useRef(false);
  const authRevisionRef = useRef(0);
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
    const authRevision = authRevisionRef.current;
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
      suspendCreateBriefRecovery();
      try {
        if (!migratedRef.current) {
          migratedRef.current = true;
          await migrateLegacyLocalStorage();
        }
        const hydrated = await fetchSessionUser();
        if (!cancelled && authRevisionRef.current === authRevision) {
          if (hydrated.status === "user") {
            setCreateBriefRecoveryOwner(hydrated.user.id);
            setUser(hydrated.user);
            setSession({ user: hydrated.user });
            setSessionUnavailable(false);
          } else if (hydrated.status === "anonymous" || hydrated.status === "deleted") {
            if (hydrated.status === "deleted") {
              try {
                sessionStorage.setItem(
                  ACCOUNT_DELETION_NOTICE_KEY,
                  "Account deletion is in progress. This session can no longer be used.",
                );
              } catch {
                // The sign-in screen still loads without the stored notice.
              }
            }
            setCreateBriefRecoveryOwner(null);
            setUser(null);
            setSession(null);
            setSessionUnavailable(false);
          } else {
            setSessionUnavailable(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsAuthProbe, probeAttempt, session, user]);

  useEffect(() => {
    const onSessionExpired = (_event: Event) => {
      authRevisionRef.current += 1;
      setCreateBriefRecoveryOwner(null);
      removeStoredToken(LEGACY_STORAGE_KEY);
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
    authRevisionRef.current += 1;
    setCreateBriefRecoveryOwner(newSession.user.id);
    removeStoredToken(LEGACY_STORAGE_KEY);
    setSession({ user: newSession.user });
    setUser(newSession.user);
  }, []);

  const signOut = useCallback(async (_options: SignOutOptions = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SESSION_PROBE_MS);
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok || payload?.success !== true) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Sign-out could not be confirmed. Try again.",
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
    // Keep the local session when revocation fails. Clearing it made the app
    // look signed out while the cookie was still valid, and the sign-in page
    // then hydrated that cookie and returned the customer to the workspace.
    authRevisionRef.current += 1;
    setCreateBriefRecoveryOwner(null);
    removeStoredToken(LEGACY_STORAGE_KEY);
    clearStudioLastAgentId();
    setSessionUnavailable(false);
    setSession(null);
    setUser(null);
  }, []);

  const retrySessionProbe = useCallback(() => {
    setSessionUnavailable(false);
    setLoading(true);
    setProbeAttempt((attempt) => attempt + 1);
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, sessionUnavailable, retrySessionProbe, signOut, signIn }),
    [user, session, loading, sessionUnavailable, retrySessionProbe, signOut, signIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
