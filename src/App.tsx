import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";
import AgentStudioWorkspace from "./AgentStudioWorkspace";
import { AuthProvider } from "./contexts/AuthContext";
import "./studio-hotfix.css";

export default function App() {
  const path = location.pathname;
  const PersonalOrMain = path.indexOf("/app/personal") === 0 || path === "/personal-home" ? PersonalWorkspace : FigmaOverhaul;

  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
      <AuthProvider>
        <PersonalOrMain />
      </AuthProvider>
    </div>
  );
}
