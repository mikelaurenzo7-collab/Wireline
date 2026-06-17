import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";
import AgentStudioWorkspace from "./AgentStudioWorkspace";
import { AuthProvider } from "./contexts/AuthContext";
import "./studio-hotfix.css";

export default function App() {
  const path = location.pathname;
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
