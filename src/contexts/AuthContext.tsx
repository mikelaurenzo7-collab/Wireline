import React, { createContext, useContext, useEffect, useState } from "react";

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
      } catch (e) {
        localStorage.removeItem("wireline_session");
      }
    }
    setLoading(false);
  }, []);

  const signIn = (newSession: Session) => {
    localStorage.setItem("wireline_session", JSON.stringify(newSession));
    setSession(newSession);
    setUser(newSession.user);
  };

  const signOut = async () => {
    localStorage.removeItem("wireline_session");
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, signIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
