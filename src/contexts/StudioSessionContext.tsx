import { createContext, useContext, useRef, type ReactNode } from "react";
import { createStudioSessionState, type StudioSessionState } from "../lib/studio-session-state";
import { useAuth } from "./AuthContext";

const StudioSessionContext = createContext<StudioSessionState | null>(null);

/** Auth owns the lifetime; leaving Studio must not discard its unsaved work. */
export function StudioSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const session = useRef<StudioSessionState | null>(null);
  // Replace before rendering children, including logout and direct account
  // switches. Late writes retain only their detached old account's references.
  if (!session.current || session.current.ownerId !== ownerId) {
    session.current = createStudioSessionState(ownerId);
  }
  return (
    <StudioSessionContext.Provider value={session.current}>
      {children}
    </StudioSessionContext.Provider>
  );
}

export function useStudioSessionState() {
  const session = useContext(StudioSessionContext);
  if (!session) throw new Error("Studio requires its authenticated session provider.");
  return session;
}
