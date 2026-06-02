import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { SESSION_EXPIRED_EVENT, resetSessionExpiredGuard } from "../lib/api";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  /** True only for the platform owner (email matches OWNER_EMAIL). Gates the Founder's Dashboard. */
  is_owner?: boolean;
}

export interface Session {
  access_token: string;
  user: User;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load from local storage
    const stored = localStorage.getItem("wireline_session");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Session;
        setSession(parsed);
        setUser(parsed.user);
      } catch {
        localStorage.removeItem("wireline_session");
      }
    }
    setLoading(false);
  }, []);

  // Stable references — without useCallback these are recreated every
  // render, which re-fires any effect that depends on them (notably
  // the OAuth bridge page). Empty deps: setters are referentially
  // stable, so these never need to change.
  const signIn = useCallback((newSession: Session) => {
    // Fresh credentials — re-arm the dead-session sniffer so a later
    // expiry is caught again.
    resetSessionExpiredGuard();
    localStorage.setItem("wireline_session", JSON.stringify(newSession));
    setSession(newSession);
    setUser(newSession.user);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem("wireline_session");
    setSession(null);
    setUser(null);
  }, []);

  // Global dead-session handler. authFetch fires SESSION_EXPIRED_EVENT when
  // the backend reports a 401/SESSION_INVALID; we sign out so AppContent
  // bounces the operator to /signin (preserving the return path) instead of
  // every panel rendering a raw "Invalid or expired session" error.
  useEffect(() => {
    const onExpired = () => {
      // Only act if we still think we're signed in — avoids a redundant
      // sign-out on the login screen.
      if (localStorage.getItem("wireline_session")) {
        void signOut();
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, signIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
