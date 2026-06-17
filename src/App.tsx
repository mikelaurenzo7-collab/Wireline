import { useEffect, useState } from "react";
import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";
import AgentStudioWorkspace from "./AgentStudioWorkspace";
import PublicMarketingWorkspace from "./PublicMarketingWorkspace";
import { AuthProvider } from "./contexts/AuthContext";
import "./studio-hotfix.css";

const publicPaths = new Set(["/", "/features", "/pricing", "/showcase", "/developers", "/compare", "/training", "/about", "/blog"]);

function cleanPath(path: string) {
  if (path === "/") return path;
  return path.replace(/\/+$/, "") || "/";
}

function useCurrentPath() {
  const [path, setPath] = useState(cleanPath(location.pathname));

  useEffect(() => {
    const update = () => setPath(cleanPath(location.pathname));
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
  if (publicPaths.has(path)) Surface = PublicMarketingWorkspace;
  if (path.indexOf("/app/personal") === 0 || path === "/personal-home") Surface = PersonalWorkspace;
  if (path.indexOf("/app/business/studio") === 0 || path === "/agents") Surface = AgentStudioWorkspace;

  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
      <AuthProvider>
        <Surface />
      </AuthProvider>
    </div>
  );
}
