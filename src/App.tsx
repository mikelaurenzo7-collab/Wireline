import { useEffect, useState } from "react";
import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";
import AgentStudioWorkspace from "./AgentStudioWorkspace";
import { AuthProvider } from "./contexts/AuthContext";
import "./studio-hotfix.css";

function useCurrentPath() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const update = () => setPath(location.pathname);
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function pushState(...args) {
      originalPushState.apply(this, args);
      update();
    };
    history.replaceState = function replaceState(...args) {
      originalReplaceState.apply(this, args);
      update();
    };
    window.addEventListener("popstate", update);
    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", update);
    };
  }, []);

  return path;
}

export default function App() {
  const path = useCurrentPath();
  let Surface = FigmaOverhaul;
  if (path.indexOf("/app/personal") === 0 || path === "/personal-home") Surface = PersonalWorkspace;
  if (path.indexOf("/app/business/studio") === 0) Surface = AgentStudioWorkspace;
  if (path === "/agents") Surface = AgentStudioWorkspace;

  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
      <AuthProvider>
        <Surface />
      </AuthProvider>
    </div>
  );
}
